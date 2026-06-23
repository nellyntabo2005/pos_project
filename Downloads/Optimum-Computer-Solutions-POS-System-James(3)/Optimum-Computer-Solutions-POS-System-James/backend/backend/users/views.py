# users/views.py
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken
from .models import SHIFT_TRACKING_EXCLUDED_ROLES, ShiftSession, User
from .serializers import (
    UserSerializer, 
    UserLoginSerializer, 
    UserChangePasswordSerializer,
    UserRoleUpdateSerializer,
    UserApprovalSerializer,
    ShiftSessionSerializer
)


def ensure_shift_tracking_allowed(user):
    return user.role not in SHIFT_TRACKING_EXCLUDED_ROLES


def start_shift_for_user(user):
    if not ensure_shift_tracking_allowed(user):
        return None, False

    active_shift = user.shift_sessions.filter(ended_at__isnull=True).order_by('-started_at').first()
    if active_shift:
        return active_shift, False

    return ShiftSession.objects.create(user=user), True

class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for User CRUD operations.
    Provides: list, create, retrieve, update, partial_update, destroy
    
    Additional actions:
    - me: Get current user info
    - change_password: Change user password
    - update_role: Update user role (admin only)
    - toggle_active: Activate/deactivate user
    """
    
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    # Filtering, searching, ordering
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['role', 'is_active', 'approval_status', 'employment_type']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone', 'employee_id']
    ordering_fields = ['username', 'date_joined', 'role', 'base_salary']
    ordering = ['-date_joined']
    
    def get_queryset(self):
        """Filter queryset based on user role"""
        user = self.request.user
        
        # Super admin sees all
        if user.role == 'super_admin':
            return User.objects.all()
        
        # Admin sees everyone except super admin
        if user.role == 'admin':
            return User.objects.exclude(role='super_admin')
        
        # Manager sees cashiers, inventory clerks, viewers only
        if user.role == 'manager':
            return User.objects.filter(role__in=['cashier', 'inventory_clerk', 'viewer'])
        
        # Others only see themselves
        return User.objects.filter(id=user.id)
    
    def get_permissions(self):
        """Custom permissions based on action"""
        if self.action == 'login':
            return [AllowAny()]
        if self.action in ['update_role', 'approve', 'reject', 'destroy']:
            # Only admins can change roles or delete users
            self.permission_classes = [IsAuthenticated]
            # Add custom permission check in the method
        return super().get_permissions()

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can create user accounts"},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        creator = self.request.user

        requested_role = serializer.validated_data.get('role')
        if requested_role in ['super_admin', 'admin'] and getattr(creator, 'role', None) != 'super_admin':
            serializer.validated_data['role'] = 'cashier'

        user = serializer.save()
        user.approve(creator)
        user.must_change_password = True
        user.approval_notes = 'Created by administrator. User must change password after first login.'
        user.save(update_fields=[
            'is_active', 'approval_status', 'approved_at', 'approved_by',
            'rejected_at', 'rejected_by', 'must_change_password', 'approval_notes'
        ])
    
    @action(detail=False, methods=['get'], url_path='me')
    def get_current_user(self, request):
        """
        GET /api/users/me/
        
        Get current authenticated user's information.
        """
        serializer = UserSerializer(request.user)
        # Add permissions to response
        data = serializer.data
        data['permissions'] = request.user.get_permissions_list()
        return Response(data)
    
    @action(detail=False, methods=['post'], url_path='login')
    def login(self, request):
        """
        POST /api/users/login/
        
        Authenticate user and return JWT tokens.
        Body: {"username": "admin", "password": "admin123"}
        """
        serializer = UserLoginSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        username = serializer.validated_data['username']
        password = serializer.validated_data['password']
        
        user = authenticate(username=username, password=password)
        
        if not user:
            pending_user = User.objects.filter(username=username).first()
            if pending_user and pending_user.check_password(password):
                if pending_user.expire_approval_if_needed():
                    return Response(
                        {"error": "Account approval expired. Please register again or contact an administrator."},
                        status=status.HTTP_403_FORBIDDEN
                    )

                if pending_user.approval_status == 'pending':
                    return Response(
                        {"error": "User account is pending admin approval. Approval must happen within 24 hours of registration."},
                        status=status.HTTP_403_FORBIDDEN
                    )

                if pending_user.approval_status == 'rejected':
                    return Response(
                        {"error": "User account registration was rejected by an administrator."},
                        status=status.HTTP_403_FORBIDDEN
                    )

            return Response(
                {"error": "Invalid username or password"},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        if user.expire_approval_if_needed():
            return Response(
                {"error": "Account approval expired. Please register again or contact an administrator."},
                status=status.HTTP_403_FORBIDDEN
            )

        if user.approval_status == 'pending':
            return Response(
                {"error": "User account is pending admin approval. Approval must happen within 24 hours of registration."},
                status=status.HTTP_403_FORBIDDEN
            )

        if user.approval_status == 'rejected':
            return Response(
                {"error": "User account registration was rejected by an administrator."},
                status=status.HTTP_403_FORBIDDEN
            )

        if not user.is_active:
            return Response(
                {"error": "User account is inactive"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Update user status
        user.is_online = True
        user.last_activity = timezone.now()
        update_last_login(None, user)
        start_shift_for_user(user)
        
        # Get client IP
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            user.last_login_ip = x_forwarded_for.split(',')[0]
        else:
            user.last_login_ip = request.META.get('REMOTE_ADDR')
        
        user.save(update_fields=['is_online', 'last_activity', 'last_login_ip'])
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data,
            'permissions': user.get_permissions_list(),
            'must_change_password': user.must_change_password
        })
    
    @action(detail=False, methods=['post'], url_path='logout')
    def logout(self, request):
        """
        POST /api/users/logout/
        
        Logout user (blacklist refresh token if needed).
        """
        # Update user status
        user = request.user
        user.is_online = False
        user.save(update_fields=['is_online'])
        active_shift = user.shift_sessions.filter(ended_at__isnull=True).order_by('-started_at').first()
        if active_shift:
            active_shift.clock_out()
        
        # Optionally blacklist the refresh token
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        
        return Response({"message": "Successfully logged out"})

    @action(detail=True, methods=['post'], url_path='clock-in')
    def clock_in(self, request, pk=None):
        """
        POST /api/users/{id}/clock-in/

        Start an 8-hour shift for a non-manager/non-admin staff member.
        """
        user = self.get_object()

        if request.user.id != user.id and request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "You can only clock in your own shift"},
                status=status.HTTP_403_FORBIDDEN
            )

        if not ensure_shift_tracking_allowed(user):
            return Response(
                {"error": "Managers and administrators are not shift-tracked"},
                status=status.HTTP_400_BAD_REQUEST
            )

        shift, created = start_shift_for_user(user)
        user.is_online = True
        user.last_activity = timezone.now()
        user.save(update_fields=['is_online', 'last_activity'])
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(ShiftSessionSerializer(shift).data, status=response_status)

    @action(detail=True, methods=['post'], url_path='clock-out')
    def clock_out(self, request, pk=None):
        """
        POST /api/users/{id}/clock-out/

        Complete the active shift for a non-manager/non-admin staff member.
        """
        user = self.get_object()

        if request.user.id != user.id and request.user.role not in ['super_admin', 'admin', 'manager']:
            return Response(
                {"error": "You can only clock out your own shift"},
                status=status.HTTP_403_FORBIDDEN
            )

        if not ensure_shift_tracking_allowed(user):
            return Response(
                {"error": "Managers and administrators are not shift-tracked"},
                status=status.HTTP_400_BAD_REQUEST
            )

        active_shift = user.shift_sessions.filter(ended_at__isnull=True).order_by('-started_at').first()
        if not active_shift:
            return Response(
                {"error": "No active shift found for this staff member"},
                status=status.HTTP_400_BAD_REQUEST
            )

        active_shift.clock_out()
        user.is_online = False
        user.last_activity = timezone.now()
        user.save(update_fields=['is_online', 'last_activity'])
        return Response(ShiftSessionSerializer(active_shift).data)

    @action(detail=False, methods=['get'], url_path='shift-status')
    def shift_status(self, request):
        """
        GET /api/users/shift-status/

        Return active and recent 8-hour shifts for visible staff members.
        """
        visible_users = self.get_queryset().exclude(role__in=SHIFT_TRACKING_EXCLUDED_ROLES)
        shifts = ShiftSession.objects.filter(user__in=visible_users).select_related('user')[:100]
        return Response(ShiftSessionSerializer(shifts, many=True).data)
    
    @action(detail=True, methods=['post'], url_path='change-password')
    def change_password(self, request, pk=None):
        """
        POST /api/users/{id}/change-password/
        
        Change user's password.
        Body: {"old_password": "old", "new_password": "new", "confirm_password": "new"}
        """
        user = self.get_object()
        
        # Check if user is changing their own password or is admin
        if request.user.id != user.id and request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "You can only change your own password"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = UserChangePasswordSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        # For non-admin users, verify old password
        if request.user.id == user.id:
            if not user.check_password(serializer.validated_data['old_password']):
                return Response(
                    {"old_password": "Wrong password"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Set new password
        user.set_password(serializer.validated_data['new_password'])
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])
        
        return Response({"message": "Password changed successfully"})

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can update user accounts"},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can update user accounts"},
                status=status.HTTP_403_FORBIDDEN
            )
        return super().partial_update(request, *args, **kwargs)
    
    @action(detail=True, methods=['patch'], url_path='update-role')
    def update_role(self, request, pk=None):
        """
        PATCH /api/users/{id}/update-role/
        
        Update user's role and status. Admin only.
        Body: {"role": "manager", "is_active": true}
        """
        # Check permission
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can update user roles"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = self.get_object()
        
        # Prevent changing super_admin role
        if user.role == 'super_admin' and request.user.role != 'super_admin':
            return Response(
                {"error": "Only super admin can modify super admin users"},
                status=status.HTTP_403_FORBIDDEN
            )

        requested_role = request.data.get('role')
        if requested_role in ['super_admin', 'admin'] and request.user.role != 'super_admin':
            return Response(
                {"error": "Only super admin can assign administrator roles"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = UserRoleUpdateSerializer(user, data=request.data, partial=True)
        
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """
        POST /api/users/{id}/approve/

        Approve a pending user within 24 hours.
        """
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can approve users"},
                status=status.HTTP_403_FORBIDDEN
            )

        user = self.get_object()

        if user.id == request.user.id:
            return Response(
                {"error": "You cannot approve your own account"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if user.expire_approval_if_needed():
            return Response(
                {"error": "Approval window has expired for this user"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if user.approval_status == 'approved':
            return Response(
                {"error": "User is already approved"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.approve(request.user)
        user.save(update_fields=[
            'is_active', 'approval_status', 'approved_at', 'approved_by',
            'rejected_at', 'rejected_by'
        ])

        return Response(UserSerializer(user).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """
        POST /api/users/{id}/reject/

        Reject a pending user registration.
        """
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can reject users"},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = UserApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = self.get_object()

        if user.id == request.user.id:
            return Response(
                {"error": "You cannot reject your own account"},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.reject(request.user, serializer.validated_data.get('notes', ''))
        user.save(update_fields=[
            'is_active', 'is_online', 'approval_status', 'rejected_at',
            'rejected_by', 'approval_notes'
        ])

        return Response(UserSerializer(user).data)
    
    @action(detail=True, methods=['post'], url_path='toggle-active')
    def toggle_active(self, request, pk=None):
        """
        POST /api/users/{id}/toggle-active/
        
        Activate or deactivate a user.
        """
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can activate/deactivate users"},
                status=status.HTTP_403_FORBIDDEN
            )
        
        user = self.get_object()
        
        # Prevent deactivating yourself
        if user.id == request.user.id:
            return Response(
                {"error": "You cannot deactivate your own account"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.is_active = not user.is_active
        if not user.is_active:
            user.is_online = False
        user.save()
        
        status_text = "activated" if user.is_active else "deactivated"
        return Response({"message": f"User {user.username} {status_text}"})
    
    def destroy(self, request, *args, **kwargs):
        """Soft delete - deactivate instead of delete"""
        if request.user.role not in ['super_admin', 'admin']:
            return Response(
                {"error": "Only administrators can delete user accounts"},
                status=status.HTTP_403_FORBIDDEN
            )

        user = self.get_object()
        
        if user.id == request.user.id:
            return Response(
                {"error": "You cannot delete your own account"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user.is_active = False
        user.is_online = False
        user.save()
        active_shift = user.shift_sessions.filter(ended_at__isnull=True).order_by('-started_at').first()
        if active_shift:
            active_shift.clock_out()
        
        return Response(
            {"message": f"User {user.username} has been deactivated"},
            status=status.HTTP_200_OK
        )
    
    @action(detail=False, methods=['get'], url_path='cashiers')
    def get_cashiers(self, request):
        """
        GET /api/users/cashiers/
        
        Get all cashier users (for POS assignment).
        """
        cashiers = User.objects.filter(role='cashier', is_active=True)
        serializer = UserSerializer(cashiers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'], url_path='by-role')
    def get_by_role(self, request):
        """
        GET /api/users/by-role/?role=manager
        
        Get users by role.
        """
        role = request.query_params.get('role')
        if not role:
            return Response(
                {"error": "Role parameter is required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        users = User.objects.filter(role=role, is_active=True)
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)
