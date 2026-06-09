from django.test import TestCase
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal
from .models import Customer

User = get_user_model()

class CustomerModelTest(TestCase):
    """Test Customer model functionality"""
    
    def setUp(self):
        """Create test data"""
        self.customer_data = {
            'name': 'John Doe',
            'phone': '0712345678',
            'email': 'john@example.com',
            'address_line1': '123 Main St',
            'city': 'Nairobi',
            'county': 'Nairobi',
        }
    
    def test_create_customer(self):
        """Test creating a customer"""
        customer = Customer.objects.create(**self.customer_data)
        
        self.assertEqual(customer.name, 'John Doe')
        self.assertEqual(customer.phone, '0712345678')
        self.assertEqual(customer.email, 'john@example.com')
        self.assertTrue(customer.account_reference.startswith('CUST-'))
        self.assertEqual(customer.loyalty_points, 0)
        self.assertEqual(customer.total_spent, Decimal('0.00'))
    
    def test_account_reference_auto_generation(self):
        """Test account_reference is auto-generated"""
        customer1 = Customer.objects.create(name='Customer 1', phone='0711111111', email='c1@example.com')
        customer2 = Customer.objects.create(name='Customer 2', phone='0722222222', email='c2@example.com')
        
        self.assertEqual(customer1.account_reference, 'CUST-000001')
        self.assertEqual(customer2.account_reference, 'CUST-000002')
    
    def test_unique_phone_constraint(self):
        """Test phone numbers must be unique"""
        Customer.objects.create(**self.customer_data)
        
        with self.assertRaises(IntegrityError):
            Customer.objects.create(
                name='Jane Doe',
                phone='0712345678',
                email='jane@example.com'
            )
    
    def test_update_spending(self):
        """Test updating customer spending and loyalty points"""
        customer = Customer.objects.create(**self.customer_data)
        
        # Spend 250 KES
        customer.update_spending(Decimal('250.00'))
        customer.refresh_from_db()
        
        self.assertEqual(customer.total_spent, Decimal('250.00'))
        self.assertEqual(customer.loyalty_points, 2)  # 1 point per 100 KES
    
    def test_redeem_loyalty_points(self):
        """Test redeeming loyalty points"""
        customer = Customer.objects.create(**self.customer_data)
        customer.update_spending(Decimal('500.00'))  # Get 5 points
        customer.refresh_from_db()
        
        self.assertEqual(customer.loyalty_points, 5)
        
        # Redeem 3 points
        customer.redeem_loyalty_points(3)
        customer.refresh_from_db()
        
        self.assertEqual(customer.loyalty_points, 2)
    
    def test_redeem_more_points_than_available(self):
        """Test cannot redeem more points than available"""
        customer = Customer.objects.create(**self.customer_data)
        customer.update_spending(Decimal('100.00'))  # Get 1 point
        
        with self.assertRaises(ValidationError):
            customer.redeem_loyalty_points(10)
    
    def test_discount_percentage_by_tier(self):
        """Test discount percentage based on pricing tier"""
        retail = Customer.objects.create(name='Retail', phone='0711111111', email='retail@example.com', pricing_tier='retail')
        wholesale = Customer.objects.create(name='Wholesale', phone='0722222222', email='wholesale@example.com', pricing_tier='wholesale')
        vip = Customer.objects.create(name='VIP', phone='0733333333', email='vip@example.com', pricing_tier='vip')
        
        self.assertEqual(retail.get_discount_percentage(), 0)
        self.assertEqual(wholesale.get_discount_percentage(), 10)
        self.assertEqual(vip.get_discount_percentage(), 15)


class CustomerAPITest(TestCase):
    """Test Customer API endpoints"""
    
    def setUp(self):
        """Setup API client and auth"""
        self.client = APIClient()
        
        # Create a test user and get JWT token
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        response = self.client.post('/api/token/', {'username': 'testuser', 'password': 'testpass123'})
        self.token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        
        # Create test customer
        self.customer = Customer.objects.create(
            name='API Test Customer',
            phone='0799999999',
            email='api@test.com'
        )
    
    def test_list_customers(self):
        """Test GET /api/customers/"""
        response = self.client.get('/api/customers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
    
    def test_create_customer(self):
        """Test POST /api/customers/"""
        data = {
            'name': 'New Customer',
            'phone': '0744444444',
            'email': 'new@customer.com'
        }
        response = self.client.post('/api/customers/', data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Customer')
    
    def test_search_by_phone(self):
        """Test GET /api/customers/search-by-phone/"""
        response = self.client.get(f'/api/customers/search-by-phone/?phone={self.customer.phone}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.customer.name)
    
    def test_redeem_points(self):
        """Test POST /api/customers/{id}/redeem-points/"""
        # First add some points
        self.customer.update_spending(Decimal('500.00'))  # Gets 5 points
        self.customer.refresh_from_db()
        
        response = self.client.post(f'/api/customers/{self.customer.id}/redeem-points/', 
                                   {'points_to_redeem': 3})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['points_remaining'], 2)
        self.assertEqual(response.data['discount_value_kes'], 3)
    
    def test_loyalty_info(self):
        """Test GET /api/customers/{id}/loyalty-info/"""
        response = self.client.get(f'/api/customers/{self.customer.id}/loyalty-info/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('loyalty_points', response.data)
        self.assertIn('discount_percentage', response.data)
