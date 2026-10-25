"""Create persistent contracts schema: investigations, source_documents, ai_runs

Revision ID: 002_persistent_contracts
Revises: 001_initial_schema
Create Date: 2026-10-23 22:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '002_persistent_contracts'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update investigations table with persistent contract columns
    with op.batch_alter_table('investigations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('investigation_number', sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column('manufacturing_stage', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('site_department', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('equipment', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('observed_deviation', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('expected_condition', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('actual_condition', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('investigator_name', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('reviewer_name', sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('version', sa.Integer(), server_default='1', nullable=False))
        batch_op.add_column(sa.Column('content', sa.JSON(), server_default='{}', nullable=False))
        batch_op.create_index('ix_investigations_investigation_number', ['investigation_number'], unique=True)

    # 2. Create source_documents table
    op.create_table(
        'source_documents',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source_type', sa.String(length=20), server_default='TEXT', nullable=False),
        sa.Column('display_name', sa.String(length=255), nullable=False),
        sa.Column('extracted_text', sa.Text(), nullable=False),
        sa.Column('segments', sa.JSON(), server_default='[]', nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_source_documents_investigation_id', 'source_documents', ['investigation_id'])

    # 3. Create ai_runs table
    op.create_table(
        'ai_runs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('investigation_id', sa.String(length=36), sa.ForeignKey('investigations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('draft_version', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(length=30), server_default='PENDING', nullable=False),
        sa.Column('completed_stages', sa.JSON(), server_default='[]', nullable=False),
        sa.Column('model_id', sa.String(length=100), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('structured_output', sa.JSON(), nullable=True),
        sa.Column('failure_code', sa.String(length=100), nullable=True),
        sa.Column('failure_message', sa.String(length=500), nullable=True),
    )
    op.create_index('ix_ai_runs_investigation_id', 'ai_runs', ['investigation_id'])


def downgrade() -> None:
    op.drop_table('ai_runs')
    op.drop_table('source_documents')
    with op.batch_alter_table('investigations', schema=None) as batch_op:
        batch_op.drop_index('ix_investigations_investigation_number')
        batch_op.drop_column('content')
        batch_op.drop_column('version')
        batch_op.drop_column('reviewed_at')
        batch_op.drop_column('reviewer_name')
        batch_op.drop_column('investigator_name')
        batch_op.drop_column('actual_condition')
        batch_op.drop_column('expected_condition')
        batch_op.drop_column('observed_deviation')
        batch_op.drop_column('equipment')
        batch_op.drop_column('site_department')
        batch_op.drop_column('manufacturing_stage')
        batch_op.drop_column('investigation_number')
