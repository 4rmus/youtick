CREATE TRIGGER finality_watermarks_contiguous_update
BEFORE UPDATE OF block_height, block_hash ON finality_watermarks
FOR EACH ROW
WHEN NOT (
    (NEW.block_height = OLD.block_height AND NEW.block_hash = OLD.block_hash)
    OR NEW.block_height = OLD.block_height + 1
)
BEGIN
    SELECT RAISE(ABORT, 'non_contiguous_finality_watermark');
END;
