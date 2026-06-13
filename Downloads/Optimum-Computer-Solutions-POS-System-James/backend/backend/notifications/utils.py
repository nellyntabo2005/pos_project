from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def send_notification(user, message):
    channel_layer = get_channel_layer()

    async_to_sync(channel_layer.group_send)(
        f"user_{user.id}",
        {
            "type": "send_notification",
            "message": message
        }
    )


def get_default_in_app_channel():
    from .models import NotificationChannel

    channel, _ = NotificationChannel.objects.get_or_create(
        channel_type='in_app',
        is_default=True,
        defaults={
            'name': 'In-App Notifications',
            'config': {},
            'priority': 1,
            'is_active': True,
        },
    )
    if not channel.is_active:
        channel.is_active = True
        channel.save(update_fields=['is_active', 'updated_at'])
    return channel


def create_role_notifications(title, message, roles=None, priority='medium', related_product=None, related_sale=None, metadata=None):
    from users.models import User
    from .models import Notification

    roles = roles or ['super_admin', 'admin', 'manager', 'inventory_clerk']
    channel = get_default_in_app_channel()
    users = User.objects.filter(is_active=True, role__in=roles)
    created = []

    for user in users:
        event = (metadata or {}).get('event')
        duplicate_query = Notification.objects.filter(
            recipient_user=user,
            related_product=related_product,
            related_sale=related_sale,
            status__in=['pending', 'sent'],
        )
        if event:
            duplicate_query = duplicate_query.filter(metadata__event=event)
        if event and duplicate_query.exists():
            continue

        created.append(Notification.objects.create(
            title=title,
            message=message,
            channel=channel,
            priority=priority,
            recipient_user=user,
            recipient_email=user.email or None,
            related_product=related_product,
            related_sale=related_sale,
            metadata=metadata or {},
        ))

    return created
