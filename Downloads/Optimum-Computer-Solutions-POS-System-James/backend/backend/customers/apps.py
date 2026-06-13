# customers/apps.py
from django.apps import AppConfig

class CustomersConfig(AppConfig):
    """
    App configuration for customers module.
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'customers'
    verbose_name = 'Customer Management'
    
    def ready(self):
        """
        Called when Django starts.
        Import signals here if you have any.
        """
        # import customers.signals  # Uncomment if you create signals.py
        pass