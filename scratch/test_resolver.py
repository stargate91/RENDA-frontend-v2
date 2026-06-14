import sys
import os
from pathlib import Path

# Add project root to python path
sys.path.append(str(Path(__file__).parent.parent))

from app.db.base import Session
from app.db.models import MediaItem, MediaMatch, ItemType
from app.resolver.resolver import Resolver

def run_resolver_test(name, fn_title, fd_title, target_year=None):
    print(f"\n==========================================")
    print(f"TEST CASE: {name}")
    print(f"fn_title: {fn_title} | fd_title: {fd_title} | year: {target_year}")
    print(f"==========================================")
    
    db = Session()
    try:
        mock_item = MediaItem(
            original_path=f"E:\\test\\{fd_title}\\{fn_title}.mp4",
            current_path=f"E:\\test\\{fd_title}\\{fn_title}.mp4",
            filename=fn_title,
            extension="mp4",
            size=1024*1024*100,
            item_type=ItemType.MOVIE,
            
            fn_title=fn_title,
            fn_year=target_year,
            
            fd_title=fd_title,
            fd_year=None,
            
            status="new"
        )
        
        db.add(mock_item)
        db.flush()
        
        resolver = Resolver(db)
        resolver.resolve_item(mock_item, language="en")
        
        matches = db.query(MediaMatch).filter(MediaMatch.media_item_id == mock_item.id).all()
        print(f"Found {len(matches)} matches (showing top 5):")
        for idx, m in enumerate(matches[:5]):
            loc = m.localizations[0] if m.localizations else None
            title = loc.title if loc else "No Title"
            release_date = m.release_date.strftime("%Y-%m-%d") if m.release_date else "No Date"
            print(f"  {idx+1}. TMDB ID: {m.tmdb_id} | Title: {title} ({release_date}) | Active: {m.is_active}")
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.rollback()
        Session.remove()

if __name__ == "__main__":
    # Edge Case 1: Generic folder name ("Downloads") + specific filename ("Inception")
    # Expected: Inception should be the active match, not the movie "Downloads"
    run_resolver_test("Generic Folder + Specific File", fn_title="Inception", fd_title="Downloads", target_year=2010)
    
    # Edge Case 2: Different valid movies in folder and filename ("Avengers" vs "Iron Man")
    # Expected: Filename ("Avengers") should take precedence and be marked active (higher source_priority 30 vs 20)
    run_resolver_test("Conflicting Movies (File vs Folder)", fn_title="The Avengers", fd_title="Iron Man", target_year=2012)
