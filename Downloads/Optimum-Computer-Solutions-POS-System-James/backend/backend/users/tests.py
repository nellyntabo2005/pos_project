# users/tests.py
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()

class UserModelTest(TestCase):
    """Test User model functionality"""
    
    def setUp(self):
        self.user_data = {
            'username': 'testcashier',
            'password': 'testpass123',
            'email': 'cashier@test.com',
            'phone': '0712345678',
            'first_name': 'Test',
            'last_name': 'Cashier',
            'role': 'cashier',
        }
    
    def test_create_user(self):
        """Test creating a user"""
        user = User.objects.create_user(**self.user_data)
        
        self.assertEqual(user.username, 'testcashier')
        self.assertEqual(user.email, 'cashier@test.com')
        self.assertEqual(user.phone, '0712345678')
        self.assertTrue(user.check_password('testpass123'))
        self.assertEqual(user.role, 'cashier')
    
    def test_employee_id_auto_generation(self):
        """Test employee_id is auto-generated"""
        user1 = User.objects.create_user(
            username='user1', 
            email='user1@test.com',
            phone='0711111111',
            password='pass123'
        )
        user2 = User.objects.create_user(
            username='user2',
            email='user2@test.com', 
            phone='0722222222',
            password='pass123'
        )
        
        self.assertIsNotNone(user1.employee_id)
        self.assertIsNotNone(user2.employee_id)
        self.assertNotEqual(user1.employee_id, user2.employee_id)
    
    def test_unique_phone_constraint(self):
        """Test phone numbers must be unique"""
        User.objects.create_user(
            username='user1',
            email='user1@test.com',
            phone='0712345678',
            password='pass123'
        )
        
        with self.assertRaises(Exception):
            User.objects.create_user(
                username='user2',
                email='user2@test.com',
                phone='0712345678',  # Same phone
                password='pass123'
            )
    
    def test_permissions_methods(self):
        """Test permission helper methods"""
        cashier = User.objects.create_user(
            username='cashier',
            email='cashier@test.com',
            phone='0711111111',
            password='pass123',
            role='cashier'
        )
        
        admin = User.objects.create_user(
            username='admin',
            email='admin@test.com',
            phone='0722222222',
            password='pass123',
            role='admin'
        )
        
        self.assertTrue(cashier.is_cashier)
        self.assertFalse(admin.is_cashier)
        
        self.assertTrue(admin.can_manage_users)
        self.assertFalse(cashier.can_manage_users)
    
    def test_commission_calculation(self):
        """Test commission calculation"""
        user = User.objects.create_user(
            username='sales',
            email='sales@test.com',
            phone='0733333333',
            password='pass123',
            commission_rate=5  # 5%
        )
        
        commission = user.calculate_commission(10000)
        self.assertEqual(commission, 500)


class UserAPITest(TestCase):
    """Test User API endpoints"""
    
    def setUp(self):
        self.client = APIClient()
        
        # Create admin user
        self.admin = User.objects.create_superuser(
            username='admin',
            email='admin@test.com',
            phone='0711111111',
            password='admin123',
            role='admin'
        )
        
        # Create regular user
        self.cashier = User.objects.create_user(
            username='cashier',
            email='cashier@test.com',
            phone='0722222222',
            password='cashier123',
            role='cashier'
        )
        
        # Get token for admin
        response = self.client.post('/api/users/login/', {
            'username': 'admin',
            'password': 'admin123'
        })
        self.admin_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')
    
    def test_login(self):
        """Test user login endpoint"""
        response = self.client.post('/api/users/login/', {
            'username': 'cashier',
            'password': 'cashier123'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['username'], 'cashier')
    
    def test_get_current_user(self):
        """Test GET /api/users/me/"""
        response = self.client.get('/api/users/me/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'admin')
        self.assertIn('permissions', response.data)
    
    def test_list_users(self):
        """Test GET /api/users/"""
        response = self.client.get('/api/users/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 2)
    
    def test_create_user(self):
        """Test POST /api/users/"""
        data = {
            'username': 'newcashier',
            'password': 'newpass123',
            'confirm_password': 'newpass123',
            'email': 'new@test.com',
            'phone': '0744444444',
            'first_name': 'New',
            'last_name': 'Cashier',
            'role': 'cashier',
        }
        
        response = self.client.post('/api/users/', data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['username'], 'newcashier')
    
    def test_update_role(self):
        """Test POST /api/users/{id}/update-role/"""
        response = self.client.patch(f'/api/users/{self.cashier.id}/update-role/', {
            'role': 'manager'
        })
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'manager')
    
    def test_get_cashiers(self):
        """Test GET /api/users/cashiers/"""
        response = self.client.get('/api/users/cashiers/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should include the cashier user
        usernames = [u['username'] for u in response.data]
        self.assertIn('cashier', usernames)
