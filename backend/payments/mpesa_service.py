# payments/mpesa_service.py
import requests
import base64
import json
from datetime import datetime
from decimal import Decimal
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from .models import MpesaAccount, MpesaTransaction, MpesaCallbackLog

class MpesaService:
    """M-Pesa API Integration Service"""
    
    def __init__(self, account=None):
        """Initialize with specific M-Pesa account or get default"""
        if account:
            self.account = account
        else:
            self.account = MpesaAccount.objects.filter(is_default=True, is_active=True).first()
            if not self.account:
                self.account = self._create_default_account_from_settings()
        
        if not self.account:
            raise Exception("No active M-Pesa account found")
        
        self.base_url = self._get_base_url()
        self.consumer_key = self.account.consumer_key
        self.consumer_secret = self.account.consumer_secret

    def _create_default_account_from_settings(self):
        required_settings = [
            'MPESA_CONSUMER_KEY',
            'MPESA_CONSUMER_SECRET',
            'MPESA_PASSKEY',
        ]
        missing_settings = [
            setting_name
            for setting_name in required_settings
            if not getattr(settings, setting_name, '')
        ]

        shortcode = (
            getattr(settings, 'MPESA_EXPRESS_SHORTCODE', '')
            or getattr(settings, 'MPESA_SHORTCODE', '')
        )
        if not shortcode:
            missing_settings.append('MPESA_SHORTCODE')

        if missing_settings:
            raise Exception(f"Missing M-Pesa settings: {', '.join(missing_settings)}")

        callback_url = getattr(settings, 'MPESA_CALLBACK_URL', '') or 'https://example.com/api/payments/mpesa-payments/callback/'

        return MpesaAccount.objects.create(
            name='Default M-Pesa Sandbox',
            business_type='paybill',
            shortcode=shortcode,
            passkey=getattr(settings, 'MPESA_PASSKEY'),
            consumer_key=getattr(settings, 'MPESA_CONSUMER_KEY'),
            consumer_secret=getattr(settings, 'MPESA_CONSUMER_SECRET'),
            environment=getattr(settings, 'DARAJA_ENVIRONMENT', getattr(settings, 'MPESA_ENVIRONMENT', 'sandbox')),
            callback_url=callback_url,
            timeout_url=callback_url,
            result_url=callback_url,
            is_active=True,
            is_default=True,
            business_name='Optimum POS',
            business_shortcode=shortcode,
        )

    def _get_base_url(self):
        if self.account.environment == 'production':
            return 'https://api.safaricom.co.ke'
        return 'https://sandbox.safaricom.co.ke'
    
    def get_access_token(self):
        """
        Get OAuth access token from Safaricom
        """
        cache_key = f"mpesa_access_token_{self.account.id}_{self.account.environment}"
        cached_token = cache.get(cache_key)
        if cached_token:
            return cached_token

        url = f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials"
        
        # Encode credentials
        credentials = f"{self.consumer_key}:{self.consumer_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            'Authorization': f'Basic {encoded_credentials}'
        }
        
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
            
            if 'access_token' in data:
                cache.set(cache_key, data['access_token'], 3300)
                return data['access_token']
            else:
                raise Exception(f"Failed to get token: {data}")
                
        except requests.exceptions.RequestException as e:
            response_text = ''
            if getattr(e, 'response', None) is not None:
                response_text = e.response.text[:300]
            detail = f" {response_text}" if response_text else ''
            raise Exception(
                "M-Pesa API authorization failed. Check the Daraja consumer key, "
                f"consumer secret, shortcode, passkey, and environment.{detail}"
            )
    
    def stk_push(self, phone_number, amount, account_reference, transaction_desc, callback_url=None):
        """
        Initiate STK Push (Lipa Na M-Pesa Online)
        
        Args:
            phone_number: Customer phone number (2547XXXXXXXX)
            amount: Amount to charge
            account_reference: Invoice/Order number
            transaction_desc: Description of transaction
            callback_url: URL for callback (uses account default if None)
        
        Returns:
            dict: Response from M-Pesa API
        """
        access_token = self.get_access_token()
        
        url = f"{self.base_url}/mpesa/stkpush/v1/processrequest"
        
        # Format timestamp
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        
        # Generate password
        password_str = f"{self.account.shortcode}{self.account.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        # Format phone number (remove leading 0 or +)
        phone = phone_number
        if phone.startswith('0'):
            phone = '254' + phone[1:]
        elif phone.startswith('+'):
            phone = phone[1:]
        
        payload = {
            'BusinessShortCode': self.account.shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'TransactionType': 'CustomerPayBillOnline' if self.account.business_type == 'paybill' else 'CustomerBuyGoodsOnline',
            'Amount': int(amount),
            'PartyA': phone,
            'PartyB': self.account.shortcode,
            'PhoneNumber': phone,
            'CallBackURL': callback_url or self.account.callback_url,
            'AccountReference': account_reference[:12],  # Max 12 chars
            'TransactionDesc': transaction_desc[:13]  # Max 13 chars
        }
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            # Create transaction record
            transaction = MpesaTransaction.objects.create(
                transaction_type='stk_push',
                amount=amount,
                phone_number=phone,
                account_reference=account_reference,
                transaction_desc=transaction_desc,
                merchant_request_id=result.get('MerchantRequestID'),
                checkout_request_id=result.get('CheckoutRequestID'),
                response_code=result.get('ResponseCode'),
                response_description=result.get('ResponseDescription'),
                status='pending' if result.get('ResponseCode') == '0' else 'failed',
                mpesa_account=self.account
            )
            
            return {
                'success': result.get('ResponseCode') == '0',
                'message': result.get('ResponseDescription'),
                'checkout_request_id': result.get('CheckoutRequestID'),
                'merchant_request_id': result.get('MerchantRequestID'),
                'transaction_id': transaction.id
            }
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"STK Push failed: {str(e)}")
    
    def query_status(self, checkout_request_id):
        """
        Query the status of an STK Push transaction
        """
        access_token = self.get_access_token()
        
        url = f"{self.base_url}/mpesa/stkpushquery/v1/query"
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password_str = f"{self.account.shortcode}{self.account.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        payload = {
            'BusinessShortCode': self.account.shortcode,
            'Password': password,
            'Timestamp': timestamp,
            'CheckoutRequestID': checkout_request_id
        }
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            # Find and update transaction
            transaction = MpesaTransaction.objects.filter(
                checkout_request_id=checkout_request_id
            ).first()
            
            if transaction:
                result_code = str(result.get('ResultCode', ''))
                if result_code == '0':
                    transaction.mark_completed(
                        receipt_number=result.get('MpesaReceiptNumber') or result.get('ReceiptNumber') or checkout_request_id,
                        result_code=0,
                        result_desc=result.get('ResultDesc', 'Success')
                    )
                elif result_code:
                    transaction.mark_failed(
                        result_code=int(result_code) if result_code else -1,
                        result_desc=result.get('ResultDesc', 'Failed')
                    )
            
            return {
                'success': str(result.get('ResultCode', '')) == '0',
                'result_code': result.get('ResultCode'),
                'result_desc': result.get('ResultDesc'),
                'receipt_number': result.get('MpesaReceiptNumber') or result.get('ReceiptNumber')
            }
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Query failed: {str(e)}")
    
    def b2c_payment(self, phone_number, amount, transaction_desc, occasion=None):
        """
        Business to Customer payment (Refunds, Withdrawals)
        """
        access_token = self.get_access_token()
        
        url = f"{self.base_url}/mpesa/b2c/v1/paymentrequest"
        
        # Format phone
        phone = phone_number
        if phone.startswith('0'):
            phone = '254' + phone[1:]
        elif phone.startswith('+'):
            phone = phone[1:]
        
        payload = {
            'InitiatorName': self.account.consumer_key[:20],
            'SecurityCredential': 'TODO',  # Requires encryption
            'CommandID': 'BusinessPayment',
            'Amount': int(amount),
            'PartyA': self.account.shortcode,
            'PartyB': phone,
            'Remarks': transaction_desc,
            'QueueTimeOutURL': self.account.timeout_url,
            'ResultURL': self.account.result_url,
            'Occasion': occasion or transaction_desc[:100]
        }
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            result = response.json()
            
            # Create transaction record
            transaction = MpesaTransaction.objects.create(
                transaction_type='b2c',
                amount=amount,
                phone_number=phone,
                account_reference=transaction_desc,
                transaction_desc=transaction_desc,
                merchant_request_id=result.get('MerchantRequestID'),
                response_code=result.get('ResponseCode'),
                response_description=result.get('ResponseDescription'),
                status='pending' if result.get('ResponseCode') == '0' else 'failed',
                mpesa_account=self.account
            )
            
            return {
                'success': result.get('ResponseCode') == '0',
                'message': result.get('ResponseDescription'),
                'conversation_id': result.get('ConversationID'),
                'transaction_id': transaction.id
            }
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"B2C payment failed: {str(e)}")
    
    def reverse_transaction(self, transaction_id, amount):
        """
        Reverse a completed transaction
        """
        access_token = self.get_access_token()
        
        url = f"{self.base_url}/mpesa/reversal/v1/request"
        
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        password_str = f"{self.account.shortcode}{self.account.passkey}{timestamp}"
        password = base64.b64encode(password_str.encode()).decode()
        
        payload = {
            'Initiator': self.account.consumer_key[:20],
            'SecurityCredential': 'TODO',  # Requires encryption
            'CommandID': 'TransactionReversal',
            'TransactionID': transaction_id,
            'Amount': int(amount),
            'ReceiverParty': self.account.shortcode,
            'RecieverIdentifierType': '4',
            'ResultURL': self.account.result_url,
            'QueueTimeOutURL': self.account.timeout_url,
            'Remarks': 'Transaction reversal',
            'Occasion': 'Customer refund'
        }
        
        headers = {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            raise Exception(f"Reversal failed: {str(e)}")


class MpesaCallbackHandler:
    """Handle M-Pesa callbacks"""
    
    @staticmethod
    def handle_stk_push_callback(request_data, client_ip):
        """
        Handle STK Push callback from Safaricom
        """
        try:
            # Parse callback data
            body = request_data.get('Body', {})
            stk_callback = body.get('stkCallback', {})
            
            merchant_request_id = stk_callback.get('MerchantRequestID')
            checkout_request_id = stk_callback.get('CheckoutRequestID')
            result_code = stk_callback.get('ResultCode')
            result_desc = stk_callback.get('ResultDesc')
            
            # Find transaction
            transaction = MpesaTransaction.objects.filter(
                merchant_request_id=merchant_request_id,
                checkout_request_id=checkout_request_id
            ).first()
            
            if not transaction:
                # Create log for unknown transaction
                MpesaCallbackLog.objects.create(
                    transaction=None,
                    raw_data=request_data,
                    result_code=result_code,
                    result_desc=result_desc,
                    ip_address=client_ip
                )
                return False, "Transaction not found"
            
            # Create callback log
            MpesaCallbackLog.objects.create(
                transaction=transaction,
                raw_data=request_data,
                result_code=result_code,
                result_desc=result_desc,
                ip_address=client_ip
            )
            
            # Process callback
            if result_code == 0:
                # Success - confirm amount and receipt number from callback metadata.
                receipt_number = None
                paid_amount = None
                callback_metadata = stk_callback.get('CallbackMetadata', {})
                for item in callback_metadata.get('Item', []):
                    if item.get('Name') in ['MpesaReceiptNumber', 'ReceiptNumber']:
                        receipt_number = item.get('Value')
                    if item.get('Name') == 'Amount':
                        paid_amount = item.get('Value')

                transaction.callback_data = request_data
                if paid_amount is not None and transaction.amount != Decimal(str(paid_amount)):
                    transaction.mark_failed(
                        result_code,
                        f"Amount mismatch. Expected {transaction.amount}, received {paid_amount}"
                    )
                    return False, transaction.result_desc
                
                transaction.mark_completed(receipt_number, result_code, result_desc)
                return True, "Transaction completed successfully"
            else:
                transaction.mark_failed(result_code, result_desc)
                return False, result_desc
                
        except Exception as e:
            return False, str(e)
