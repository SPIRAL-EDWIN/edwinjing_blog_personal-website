#!/usr/bin/env python3
"""
Obsidian to MkDocs Markdown Converter

Converts Obsidian-flavored Markdown to MkDocs Material-compatible format.
Handles wiki links, image embeds, and file organization.

Compatibility/debugging utility only. Formal website publication uses
``tools/publish_obsidian_notes.py`` so conversion, review, preview and
promotion remain one receipt-bound workflow.

Usage:
    python convert_obsidian.py <source> [--output <dest>] [--recursive]

Examples:
    # Single file
    python convert_obsidian.py note.md --output docs/note.md
    
    # Directory
    python convert_obsidian.py vault/notes/ --output docs/notes/ --recursive
"""

import re
import os
import sys
import shutil
import argparse
from pathlib import Path
from typing import Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tools.publish_lab_projects import (
    normalize_display_math_blocks,
    normalize_obsidian_blocks,
    overlaps,
    protected_spans,
)


def replace_unprotected(content: str, pattern: str, replacement) -> str:
    """Apply a regex replacement outside front matter, code, comments and math."""

    spans = protected_spans(content, ())
    matches = [
        match
        for match in re.finditer(pattern, content)
        if not overlaps(match.start(), match.end(), spans)
    ]
    for match in reversed(matches):
        content = content[: match.start()] + replacement(match) + content[match.end() :]
    return content


def convert_wiki_links(content: str) -> str:
    """
    Convert Obsidian wiki links to standard Markdown links.
    
    [[Page]] -> [Page](Page.md)
    [[Page|Alias]] -> [Alias](Page.md)
    [[folder/Page]] -> [Page](folder/Page.md)
    [[Page#Header]] -> [Header](Page.md#header)
    
    Note: Links with ^block-id are left for roamlinks plugin.
    Note: [[]] inside inline code or code blocks is array/list syntax,
          NOT wiki-links. These are protected and not converted.
    """
    
    def replace_wiki_link(match):
        full_match = match.group(1)
        
        # Skip block reference links - handled by roamlinks + block-links.js
        if '#^' in full_match:
            return match.group(0)  # Keep original
        
        # Check for alias (pipe character)
        if '|' in full_match:
            target, alias = full_match.split('|', 1)
        else:
            target = full_match
            alias = None
        
        # Handle header links
        if '#' in target:
            page, header = target.split('#', 1)
            header_slug = header.lower().replace(' ', '-')
            if page:
                url = f"{page.replace(' ', '%20')}.md#{header_slug}"
                display = alias or header
            else:
                # Same-page header link
                url = f"#{header_slug}"
                display = alias or header
        else:
            url = f"{target.replace(' ', '%20')}.md"
            display = alias or target.split('/')[-1]  # Use filename as display
        
        return f"[{display}]({url})"
    
    # Match [[...]] but not ![[...]] (images)
    pattern = r'(?<!!)\[\[([^\]]+)\]\]'
    return replace_unprotected(content, pattern, replace_wiki_link)


def convert_image_embeds(content: str, images_dir: str = "images") -> str:
    """
    Convert Obsidian image embeds to standard Markdown.
    
    ![[image.png]] -> ![](images/image.png)
    ![[image.png|300]] -> ![](images/image.png){ width="300" }
    ![[image.png|300x200]] -> ![](images/image.png){ width="300" height="200" }
    """
    
    def replace_image(match):
        full_match = match.group(1)
        
        # Check for dimensions
        if '|' in full_match:
            filename, dimensions = full_match.split('|', 1)
            filename = filename.strip()
            
            # Parse dimensions
            if 'x' in dimensions:
                width, height = dimensions.split('x', 1)
                attrs = f'{{ width="{width}" height="{height}" }}'
            else:
                attrs = f'{{ width="{dimensions}" }}'
        else:
            filename = full_match.strip()
            attrs = ""
        
        # Determine image path
        if '/' in filename:
            # Already has path
            img_path = filename
        else:
            # Add images directory
            img_path = f"{images_dir}/{filename}"
        
        return f"![]({img_path}){attrs}"
    
    pattern = r'!\[\[([^\]]+)\]\]'
    return replace_unprotected(content, pattern, replace_image)


def clean_front_matter(content: str) -> str:
    """
    Clean Obsidian-specific front matter fields.
    Removes: cssclass, aliases (or keeps based on preference)
    """
    
    # Check if content starts with front matter
    if not content.startswith('---'):
        return content
    
    # Find end of front matter
    end_match = re.search(r'\n---\n', content[3:])
    if not end_match:
        return content
    
    fm_end = end_match.end() + 3
    front_matter = content[:fm_end]
    body = content[fm_end:]
    
    # Remove Obsidian-specific fields
    obsidian_fields = ['cssclass', 'cssclasses', 'aliases', 'alias']
    for field in obsidian_fields:
        # Remove single-line field
        front_matter = re.sub(rf'^{field}:.*\n', '', front_matter, flags=re.MULTILINE)
        # Remove multi-line field (list)
        front_matter = re.sub(rf'^{field}:\n(?:  - .*\n)+', '', front_matter, flags=re.MULTILINE)
    
    return front_matter + body


def fix_relative_paths(content: str, source_dir: str, dest_dir: str) -> str:
    """
    Adjust relative paths for new file location if needed.
    """
    # This is a placeholder - implement based on specific needs
    return content


def convert_file(source_path: Path, dest_path: Path, images_dir: str = "images") -> None:
    """
    Convert a single Obsidian Markdown file to MkDocs format.
    """
    print(f"Converting: {source_path} -> {dest_path}")
    
    # Read source file
    with open(source_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Apply conversions
    content = clean_front_matter(content)
    content = convert_wiki_links(content)
    content = convert_image_embeds(content, images_dir)
    content, _ = normalize_display_math_blocks(content)
    content, _ = normalize_obsidian_blocks(content, close_obsidian_lists=True)
    
    # Ensure destination directory exists
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Write converted file
    with open(dest_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"  ✓ Converted successfully")


def convert_directory(source_dir: Path, dest_dir: Path, recursive: bool = True) -> None:
    """
    Convert all Markdown files in a directory.
    """
    pattern = '**/*.md' if recursive else '*.md'
    
    for source_path in source_dir.glob(pattern):
        # Calculate relative path
        rel_path = source_path.relative_to(source_dir)
        dest_path = dest_dir / rel_path
        
        convert_file(source_path, dest_path)


def copy_images(source_dir: Path, dest_dir: Path, extensions: tuple = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp')) -> None:
    """
    Copy image files from source to destination, preserving structure.
    """
    allowed = {extension.casefold() for extension in extensions}
    for img_path in sorted(source_dir.rglob('*')):
        if not img_path.is_file() or img_path.is_symlink() or img_path.suffix.casefold() not in allowed:
            continue
        rel_path = img_path.relative_to(source_dir)
        dest_path = dest_dir / rel_path
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(img_path, dest_path)
        print(f"  Copied: {rel_path}")


def main():
    parser = argparse.ArgumentParser(
        description='Convert Obsidian Markdown to MkDocs format',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument('source', help='Source file or directory')
    parser.add_argument('--output', '-o', help='Destination file or directory')
    parser.add_argument('--recursive', '-r', action='store_true', 
                        help='Process directories recursively')
    parser.add_argument('--copy-images', action='store_true',
                        help='Also copy image files')
    parser.add_argument('--images-dir', default='images',
                        help='Subdirectory name for images (default: images)')
    
    args = parser.parse_args()
    
    source = Path(args.source)
    
    if not source.exists():
        print(f"Error: Source not found: {source}")
        sys.exit(1)
    
    # Determine destination
    if args.output:
        dest = Path(args.output)
    else:
        if source.is_file():
            dest = source.with_suffix('.converted.md')
        else:
            dest = source.parent / f"{source.name}_converted"
    
    # Convert
    if source.is_file():
        convert_file(source, dest, args.images_dir)
    else:
        convert_directory(source, dest, args.recursive)
        
        if args.copy_images:
            print("\nCopying images...")
            copy_images(source, dest)
    
    print("\n✅ Conversion complete!")


if __name__ == '__main__':
    main()
