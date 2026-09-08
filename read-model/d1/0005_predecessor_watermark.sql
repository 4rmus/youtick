-- Existing rows remain unchanged; only linked writers use these nullable columns.
ALTER TABLE finality_watermarks ADD COLUMN prev_block_height INTEGER;
ALTER TABLE finality_watermarks ADD COLUMN prev_block_hash TEXT;

DROP TRIGGER finality_watermarks_contiguous_update;
CREATE TRIGGER finality_watermarks_contiguous_update
BEFORE UPDATE OF block_height, block_hash, prev_block_height, prev_block_hash ON finality_watermarks
FOR EACH ROW
WHEN NOT COALESCE(
    (NEW.block_height = OLD.block_height AND NEW.block_hash = OLD.block_hash
        AND NEW.prev_block_height IS OLD.prev_block_height
        AND NEW.prev_block_hash IS OLD.prev_block_hash)
    OR (NEW.block_height > OLD.block_height
        AND NEW.prev_block_height = OLD.block_height
        AND NEW.prev_block_hash = OLD.block_hash)
    OR (NEW.block_height = OLD.block_height + 1
        AND OLD.prev_block_height IS NULL AND OLD.prev_block_hash IS NULL
        AND NEW.prev_block_height IS NULL AND NEW.prev_block_hash IS NULL),
    0
)
BEGIN
    SELECT RAISE(ABORT, 'non_contiguous_finality_watermark');
END;
