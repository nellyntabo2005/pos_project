# users/serializers.py
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from .models import User

class UserSerializer(serializers.ModelSerializer):

    
    # Read-only fields
    uuid = serializers.UUIDField(read_only=True)
    employee_id = serializers.CharField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    
    # Write-only fields (for password)
    password = serializers.CharField(write_only=True, required=False, validators=[validate_password])
    confirm_password = serializers.CharField(write_only=True, required=False)
    
    # Computed fields
    full_name = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id',
            'uuid',
            'username',
            'password',
            'confirm_password',
            'first_name',
            'last_name',
            'full_name',
            'email',
            'phone',
            'employee_id',
            'role',
            'employment_type',
            'hire_date',
            'base_salary',
            'commission_rate',
            'default_shift',
            'is_active',
            'is_online',
            'date_joined',
            'last_login',
            'last_activity',
            'notes',
            'created_at',
            'updated_at',
            'permissions',
        ]
        read_only_fields = ['id', 'uuid', 'employee_id', 'date_joined', 'created_at', 
                           'updated_at', 'is_online', 'last_login', 'last_activity']
        extra_kwargs = {
            'username': {'required': True},
            'email': {'required': True},
            'phone': {'required': True},
        }
    
    def get_full_name(self, obj):

        """Return user's full name"""
        return obj.get_full_name() or obj.username
    
    def get_permissions(self, obj):
        """Return user's permissions"""
        return obj.get_permissions_list()
    
    def validate_username(self, value):
        """Validate username is unique"""
        #Return user's full name
        return value.get_full_name() or value.username
    
    def get_permissions(self, obj):
        #Return user's permissions
        return obj.get_permissions_list()
    
    def validate_username(self, value):
        #Validate username is unique
        instance = self.instance
        if User.objects.exclude(pk=instance.pk if instance else None).filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value
    
    def validate_email(self, value):

        """Validate email is unique"""

        #Validate email is unique

        instance = self.instance
        if User.objects.exclude(pk=instance.pk if instance else None).filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value
    
    def validate_phone(self, value):

        """Validate phone is unique"""

        #Validate phone is unique

        instance = self.instance
        if User.objects.exclude(pk=instance.pk if instance else None).filter(phone=value).exists():
            raise serializers.ValidationError("A user with this phone already exists.")
        return value
    

    def validate(self, data):
        """Cross-field validation"""
    #Cross-field validation
    def validate(self, data):
        

        # Check passwords match
        if 'password' in data and 'confirm_password' in data:
            if data['password'] != data['confirm_password']:
                raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        
        # Remove confirm_password before saving
        if 'confirm_password' in data:
            data.pop('confirm_password')
        
        return data
    
    def create(self, validated_data):

        """Create new user with encrypted password"""

        #Create new user with encrypted password
        password = validated_data.pop('password', None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        user.save()
        return user
    
    def update(self, instance, validated_data):

        """Update user with optional password change"""
        #Update user with optional password change

        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserLoginSerializer(serializers.Serializer):

    """
    Serializer for user login.
    """

    #Serializer for user login.
    
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True, write_only=True)


class UserChangePasswordSerializer(serializers.Serializer):

    """
    Serializer for password change.
    """
    old_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, validators=[validate_password])
    confirm_password = serializers.CharField(required=True, write_only=True)
    
    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})
        return data


class UserRoleUpdateSerializer(serializers.ModelSerializer):


    #Simplified serializer for updating user role only.


 class Meta:
        model = User
        fields = ['id', 'username', 'role', 'is_active']
        read_only_fields = ['id', 'username']