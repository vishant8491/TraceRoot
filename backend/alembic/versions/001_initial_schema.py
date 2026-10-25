"""Initial schema for TraceRoot RCA Workspace

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-23 21:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Investigations table
    op.create_table(
        'investigations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('title', sa.String(length=255), nullable=False, server_default='Untitled Investigation'),
        sa.Column('deviation_number', sa.String(length=100), nullable=True),
        sa.Column('facility', sa.String(length=150), nullable=True),
        sa.Column('product_name', sa.String(length=150), nullable=True),
        sa.Column('batch_number', sa.String(length=100), nullable=True),
        sa.Column('unit_operation', sa.String(length=150), nullable=True),
        sa.Column('incident_date', sa.String(length=100), nullable=True),
        sa.Column('reported_by', sa.String(length=150), nullable=True),
        sa.Column('investigation_lead', sa.String(length=150), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='DRAFT'),
        sa.Column('observed_event', sa.Text(), nullable=True),
        sa.Column('immediate_containment', sa.Text(), nullable=True),
        sa.Column('suspected_timeline', sa.Text(), nullable=True),
        sa.Column('root_cause_summary', sa.Text(), nullable=True),
        sa.Column('uncertainty_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_investigations_deviation_number', 'investigations', ['deviation_number'])

    # Evidence items table
    op.create_table(
        'evidence_items',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=False, server_default='PASTED_TEXT'),
        sa.Column('title', sa.String(length=255), nullable=False, server_default='Evidence Record'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('supporting_points', sa.JSON(), nullable=True),
        sa.Column('contradictory_points', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_evidence_items_investigation_id', 'evidence_items', ['investigation_id'])

    # Five Whys steps table
    op.create_table(
        'five_whys_steps',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_number', sa.Integer(), nullable=False),
        sa.Column('question', sa.Text(), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='PHYSICAL'),
        sa.Column('evidence_reference', sa.String(length=255), nullable=True),
    )
    op.create_index('ix_five_whys_steps_investigation_id', 'five_whys_steps', ['investigation_id'])

    # Ishikawa factors table
    op.create_table(
        'ishikawa_factors',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('factor', sa.String(length=255), nullable=False),
        sa.Column('is_contributing', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('notes', sa.Text(), nullable=True),
    )
    op.create_index('ix_ishikawa_factors_investigation_id', 'ishikawa_factors', ['investigation_id'])

    # Missing evidence items table
    op.create_table(
        'missing_evidence_items',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('missing_item', sa.String(length=255), nullable=False),
        sa.Column('rationale', sa.Text(), nullable=False),
        sa.Column('impact_level', sa.String(length=20), nullable=False, server_default='MEDIUM'),
        sa.Column('recommended_action', sa.Text(), nullable=True),
    )
    op.create_index('ix_missing_evidence_items_investigation_id', 'missing_evidence_items', ['investigation_id'])

    # CAPA items table
    op.create_table(
        'capa_items',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('capa_type', sa.String(length=50), nullable=False),
        sa.Column('action_description', sa.Text(), nullable=False),
        sa.Column('owner', sa.String(length=150), nullable=True),
        sa.Column('target_date', sa.String(length=50), nullable=True),
        sa.Column('effectiveness_criteria', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PROPOSED'),
    )
    op.create_index('ix_capa_items_investigation_id', 'capa_items', ['investigation_id'])


def downgrade() -> None:
    op.drop_table('capa_items')
    op.drop_table('missing_evidence_items')
    op.drop_table('ishikawa_factors')
    op.drop_table('five_whys_steps')
    op.drop_table('evidence_items')
    op.drop_table('investigations')
