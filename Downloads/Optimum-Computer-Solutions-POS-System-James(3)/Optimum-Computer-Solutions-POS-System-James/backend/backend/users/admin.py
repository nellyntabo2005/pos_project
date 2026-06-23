# users/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.html import format_html
from .models import ShiftSession, User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """
    Custom admin interface for User model.
    """
    
    # Display in list view
    list_display = [
        'username',
        'full_name',
        'role_badge',
        'phone',
        'employee_id',
        'approval_status',
        'approval_deadline_at',
        'is_active',
        'is_online_badge',
        'last_activity',
    ]
    
    # Filters
    list_filter = [
        'role',
        'is_active',
        'approval_status',
        'is_online',
        'employment_type',
        'date_joined',
    ]
    
    # Search fields
    search_fields = [
        'username',
        'first_name',
        'last_name',
        'email',
        'phone',
        'employee_id',
    ]
    
    # Read-only fields
    readonly_fields = [
        'uuid',
        'employee_id',
        'last_login',
        'last_login_ip',
        'date_joined',
        'created_at',
        'updated_at',
        'approval_requested_at',
        'approval_deadline_at',
        'approved_at',
        'approved_by',
        'rejected_at',
        'rejected_by',
        'get_commission_info',
    ]
    
    # Fieldsets for edit form
    fieldsets = (
        ('Login Information', {
            'fields': ('username', 'password')
        }),
        ('Personal Information', {
            'fields': ('first_name', 'last_name', 'email', 'phone', 'employee_id')
        }),
        ('Employment Details', {
            'fields': ('role', 'employment_type', 'hire_date', 'termination_date', 'base_salary', 'commission_rate', 'default_shift')
        }),
        ('Status', {
            'fields': ('is_active', 'is_online', 'last_login', 'last_login_ip', 'last_activity')
        }),
        ('Approval', {
            'fields': (
                'approval_status',
                'approval_requested_at',
                'approval_deadline_at',
                'approved_at',
                'approved_by',
                'rejected_at',
                'rejected_by',
                'approval_notes',
            )
        }),
        ('Notes', {
            'fields': ('notes',),
            'classes': ('collapse',)
        }),
        ('System Fields', {
            'fields': ('uuid', 'created_at', 'updated_at', 'date_joined'),
            'classes': ('collapse',)
        }),
    )
    
    # Add fields to default UserAdmin fieldsets
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'email', 'phone', 'password1', 'password2', 'role'),
        }),
    )
    
    # Actions
    actions = ['approve_users', 'reject_users', 'activate_users', 'deactivate_users', 'make_cashier', 'make_manager']
    
    def full_name(self, obj):
        return obj.get_full_name() or obj.username
    full_name.short_description = 'Full Name'
    
    def role_badge(self, obj):
        colors = {
            'super_admin': 'red',
            'admin': 'orange',
            'manager': 'blue',
            'accountant': 'green',
            'cashier': 'purple',
            'inventory_clerk': 'teal',
            'viewer': 'gray',
        }
        color = colors.get(obj.role, 'black')
        return format_html(
            '<span style="background: {}; color: white; padding: 3px 8px; border-radius: 3px;">{}</span>',
            color,
            obj.get_role_display()
        )
    role_badge.short_description = 'Role'
    
    def is_online_badge(self, obj):
        if obj.is_online:
            return 'Online'
        return 'Offline'
    is_online_badge.short_description = 'Status'
    
    def get_commission_info(self, obj):
        return format_html(
            '<strong>Rate:</strong> {}%<br>'
            '<strong>Example:</strong> KES {:.2f} on KES 10,000 sale',
            obj.commission_rate,
            obj.calculate_commission(10000)
        )
    get_commission_info.short_description = 'Commission Info'
    
    def activate_users(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} users activated.')
    activate_users.short_description = 'Activate selected users'

    def approve_users(self, request, queryset):
        updated = 0
        for user in queryset:
            if user.id == request.user.id:
                continue
            if user.expire_approval_if_needed():
                continue
            user.approve(request.user)
            user.save(update_fields=[
                'is_active',
                'approval_status',
                'approved_at',
                'approved_by',
                'rejected_at',
                'rejected_by',
            ])
            updated += 1
        self.message_user(request, f'{updated} users approved.')
    approve_users.short_description = 'Approve selected users'

    def reject_users(self, request, queryset):
        updated = 0
        for user in queryset:
            if user.id == request.user.id:
                continue
            user.reject(request.user)
            user.save(update_fields=[
                'is_active',
                'is_online',
                'approval_status',
                'rejected_at',
                'rejected_by',
                'approval_notes',
            ])
            updated += 1
        self.message_user(request, f'{updated} users rejected.')
    reject_users.short_description = 'Reject selected users'
    
    def deactivate_users(self, request, queryset):
        updated = queryset.update(is_active=False, is_online=False)
        self.message_user(request, f'{updated} users deactivated.')
    deactivate_users.short_description = 'Deactivate selected users'
    
    def make_cashier(self, request, queryset):
        updated = queryset.update(role='cashier')
        self.message_user(request, f'{updated} users changed to Cashier role.')
    make_cashier.short_description = 'Change role to Cashier'
    
    def make_manager(self, request, queryset):
        updated = queryset.update(role='manager')
        self.message_user(request, f'{updated} users changed to Manager role.')
    make_manager.short_description = 'Change role to Manager'


@admin.register(ShiftSession)
class ShiftSessionAdmin(admin.ModelAdmin):
    list_display = [
        'user',
        'started_at',
        'expected_end_at',
        'ended_at',
        'is_active',
        'is_overdue',
        'progress_percent',
    ]
    list_filter = ['started_at', 'ended_at', 'expected_end_at', 'user__role']
    search_fields = ['user__username', 'user__first_name', 'user__last_name', 'user__employee_id']
    readonly_fields = ['created_at', 'updated_at', 'worked_seconds', 'remaining_seconds', 'progress_percent', 'is_overdue']
