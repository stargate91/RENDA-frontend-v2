from app.db.base import Session
from app.api.graphql_clients import AdultGraphQLClient

db = Session()
try:
    client = AdultGraphQLClient(db, "fansdb")
    for field in ["text", "title"]:
        print(f"Trying queryScenes with field: {field}")
        query = f"""
        query Search($val: String!) {{
          queryScenes(input: {{ {field}: $val }}) {{
            scenes {{
              id
              title
              studio {{
                id
                name
                images {{
                  url
                }}
              }}
            }}
          }}
        }}
        """
        res = client.execute_query(query, {"val": "Awaiting Flight"})
        if res and res.get("queryScenes"):
            scenes = res["queryScenes"].get("scenes") or []
            print(f"Found {len(scenes)} scenes:")
            for s in scenes:
                print(f"  ID: {s['id']}, Title: {s['title']}")
                print(f"    Studio: {s.get('studio')}")
finally:
    db.close()
