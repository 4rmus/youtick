CREATE INDEX publications_discover
    ON publications (network, contract_id, availability, source_block_height DESC, publication_id DESC);
