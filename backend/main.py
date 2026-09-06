from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import os

app = FastAPI(title="Ocean Visualization API")

# Allow your React frontend to communicate with this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Points to your ocean_data.db inside backend/data/
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "ocean_data.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/api/v1/ocean-data")
def get_ocean_data(
    depth: float = Query(100.0),
    parameter: str = Query("temperature")
):
    conn = get_db()
    cursor = conn.cursor()

    query = """
        SELECT 
            o.platform_id,
            o.latitude,
            o.longitude,
            o.depth,
            o.temperature AS obs_temp,
            o.salinity AS obs_sal,
            o.current_speed AS obs_speed,
            m.temperature AS model_temp,
            m.salinity AS model_sal,
            m.current_speed AS model_speed
        FROM observations o
        JOIN model_grid m ON o.latitude = m.latitude 
                          AND o.longitude = m.longitude 
                          AND o.depth = m.depth
        WHERE o.depth = ?
    """
    cursor.execute(query, (depth,))
    rows = cursor.fetchall()
    conn.close()

    param_map = {
        "temperature": ("obs_temp", "model_temp"),
        "salinity": ("obs_sal", "model_sal"),
        "current_speed": ("obs_speed", "model_speed")
    }

    obs_key, model_key = param_map.get(parameter, ("obs_temp", "model_temp"))

    results = []
    for r in rows:
        obs_val = r[obs_key]
        mod_val = r[model_key]
        results.append({
            "platform_id": r["platform_id"],
            "latitude": r["latitude"],
            "longitude": r["longitude"],
            "depth": r["depth"],
            "observed_value": obs_val,
            "model_value": mod_val,
            "difference": round(mod_val - obs_val, 2)
        })

    return {
        "depth": depth,
        "parameter": parameter,
        "count": len(results),
        "data": results
    }