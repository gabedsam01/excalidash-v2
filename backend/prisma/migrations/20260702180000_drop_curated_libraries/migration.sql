-- Curated/public Excalidraw catalog support was removed.
-- User-owned personal library/templates remain in the `Library` table.
DROP TABLE IF EXISTS "ExcalidrawLibraryPackItem" CASCADE;
DROP TABLE IF EXISTS "ExcalidrawLibraryPack" CASCADE;
DROP TABLE IF EXISTS "ExcalidrawLibraryCatalogItem" CASCADE;
