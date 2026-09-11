"""Tests for the bundled demo input-seeding path.

Hermetic: `upload_file` is mocked, so this never touches B2. Covers both the
shared service function and the `POST /runs/inputs/seed` endpoint it powers —
the in-app "Seed demo inputs" action (see docs/features/genomics-ingest.md).
"""

import pytest

from app.service import inputs as inputs_service


@pytest.fixture(autouse=True)
def mock_upload(monkeypatch):
    calls: list[tuple[str, str]] = []

    def fake_upload_file(data: bytes, key: str, content_type: str):
        calls.append((key, content_type))
        return None

    monkeypatch.setattr(inputs_service, "upload_file", fake_upload_file)
    return calls


def test_seed_demo_inputs_uploads_bundled_fastqs_and_samplesheet(mock_upload):
    result = inputs_service.seed_demo_inputs()

    assert result.sample_count == 2
    assert result.samplesheet == "inputs/samplesheets/demo-samplesheet.csv"
    assert "inputs/fastq/sample_a.fastq" in result.uploaded
    assert "inputs/fastq/sample_b.fastq" in result.uploaded
    assert result.samplesheet in result.uploaded
    # Both fastqs uploaded as text/plain, the samplesheet as text/csv.
    uploaded_types = dict(mock_upload)
    assert uploaded_types["inputs/fastq/sample_a.fastq"] == "text/plain"
    assert uploaded_types[result.samplesheet] == "text/csv"


def test_seed_demo_inputs_raises_when_bundled_data_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(inputs_service, "_DEMO_DATA_DIR", tmp_path)

    with pytest.raises(inputs_service.NoBundledDataError):
        inputs_service.seed_demo_inputs()


@pytest.mark.asyncio
async def test_seed_demo_inputs_endpoint_returns_seeded_keys(client, mock_upload):
    resp = await client.post("/runs/inputs/seed")

    assert resp.status_code == 200
    body = resp.json()
    assert body["sample_count"] == 2
    assert body["samplesheet"] == "inputs/samplesheets/demo-samplesheet.csv"
    assert len(body["uploaded"]) == 3


@pytest.mark.asyncio
async def test_seed_demo_inputs_endpoint_404s_without_bundled_data(
    client, tmp_path, monkeypatch
):
    monkeypatch.setattr(inputs_service, "_DEMO_DATA_DIR", tmp_path)

    resp = await client.post("/runs/inputs/seed")

    assert resp.status_code == 404
