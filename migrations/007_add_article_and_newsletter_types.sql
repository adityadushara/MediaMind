-- ==============================================================================
-- Migration: 007_add_article_and_newsletter_types.sql
-- Description: Expand library_items content_type check constraint to include
--              'article' and 'newsletter' (for Substack, Medium, and online essays).
-- Target: PostgreSQL 15+ / Supabase PostgreSQL / SQLite compatible
-- ==============================================================================

-- Drop existing check constraint if present
ALTER TABLE library_items DROP CONSTRAINT IF EXISTS library_items_content_type_check;

-- Recreate check constraint with article and newsletter support
ALTER TABLE library_items ADD CONSTRAINT library_items_content_type_check
    CHECK (content_type IN (
        'book',
        'movie',
        'tv_show',
        'youtube_video',
        'documentary',
        'podcast',
        'course',
        'article',
        'newsletter',
        'other'
    ));
