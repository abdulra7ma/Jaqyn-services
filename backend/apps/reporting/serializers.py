from rest_framework import serializers


class ReportQuerySerializer(serializers.Serializer):
    """Query params for the business report: period selector + optional custom range."""

    period = serializers.ChoiceField(choices=["today", "week", "month", "custom"], required=False, default="month")
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


class KpiSerializer(serializers.Serializer):
    key = serializers.CharField()
    value = serializers.CharField()
    delta_pct = serializers.IntegerField(allow_null=True)
    hint = serializers.CharField()


class SeriesPointSerializer(serializers.Serializer):
    label = serializers.CharField()
    value = serializers.IntegerField()


class StackedPointSerializer(serializers.Serializer):
    label = serializers.CharField()
    new = serializers.IntegerField()
    returning = serializers.IntegerField()


class CohortSerializer(serializers.Serializer):
    label = serializers.CharField()
    count = serializers.IntegerField()
    pct = serializers.IntegerField()


class StaffRowSerializer(serializers.Serializer):
    id = serializers.CharField()
    name = serializers.CharField()
    role = serializers.CharField()
    scans = serializers.IntegerField()
    signups = serializers.IntegerField()
    redemptions = serializers.IntegerField()
    conversion_pct = serializers.IntegerField()
    trend_pct = serializers.IntegerField(allow_null=True)
    top = serializers.BooleanField()


class TeamTotalsSerializer(serializers.Serializer):
    scans = serializers.IntegerField()
    redemptions = serializers.IntegerField()
    signups = serializers.IntegerField()
    active_days = serializers.IntegerField()


class InsightSerializer(serializers.Serializer):
    icon = serializers.CharField()
    text = serializers.CharField()


class BusinessReportSerializer(serializers.Serializer):
    """Renders the :class:`~apps.reporting.business_reports.BusinessReport` dataclass."""

    period = serializers.CharField()
    range_label = serializers.CharField()
    kpis = KpiSerializer(many=True)
    scans_over_time = SeriesPointSerializer(many=True)
    busiest_hours = SeriesPointSerializer(many=True)
    new_vs_returning = StackedPointSerializer(many=True)
    cohorts = CohortSerializer(many=True)
    staff = StaffRowSerializer(many=True)
    team_totals = TeamTotalsSerializer()
    insights = InsightSerializer(many=True)


class ManualAdjustmentSerializer(serializers.Serializer):
    customer = serializers.UUIDField()
    program = serializers.UUIDField()
    amount_count = serializers.IntegerField()
    reason = serializers.CharField(max_length=500)


class AdminReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
