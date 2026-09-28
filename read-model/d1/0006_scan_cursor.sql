-- This is a scan position, not an authoritative finality watermark.
ALTER TABLE finality_watermarks ADD COLUMN scan_height INTEGER;
ALTER TABLE finality_watermarks ADD COLUMN scan_revision INTEGER NOT NULL DEFAULT 0;

-- Every advancing final block resets the tentative scan in the same D1 batch.
CREATE TRIGGER finality_watermarks_scan_reset
AFTER UPDATE OF block_height, block_hash ON finality_watermarks
FOR EACH ROW
WHEN NEW.block_height != OLD.block_height OR NEW.block_hash != OLD.block_hash
BEGIN
    UPDATE finality_watermarks SET scan_height = NULL
    WHERE network = NEW.network AND contract_id = NEW.contract_id;
END;
