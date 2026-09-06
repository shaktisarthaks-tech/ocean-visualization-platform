import sqlite3
import os
import math
import random

DB_PATH = os.path.join(os.path.dirname(__file__), "ocean_data.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Table 1: In-situ sensor observations (ARGO floats)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform_id TEXT,
            timestamp TEXT,
            latitude REAL,
            longitude REAL,
            depth REAL,
            temperature REAL,
            salinity REAL,
            current_speed REAL
        )
    ''')

    # Table 2: Numerical physics model output grid
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS model_grid (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_name TEXT,
            timestamp TEXT,
            latitude REAL,
            longitude REAL,
            depth REAL,
            temperature REAL,
            salinity REAL,
            current_speed REAL
        )
    ''')

    cursor.execute('DELETE FROM observations')
    cursor.execute('DELETE FROM model_grid')

    # Standard ocean depth levels in meters
    depth_levels = [0, 50, 100, 200, 500, 1000, 2000, 3000]

    # Coordinate bounding box for Indian Ocean: Lat -8 to 21 N, Lon 62 to 93 E
    for i in range(1, 30):
        platform_id = f"INCOIS_ARGO_{2902100 + i}"
        lat = round(random.uniform(-8.0, 21.0), 2)
        lon = round(random.uniform(62.0, 93.0), 2)

        for depth in depth_levels:
            # Physical ocean thermocline decay curve
            t_surface = 29.5 - (abs(lat) * 0.12)
            t_decay = math.exp(-depth / 380.0)
            obs_temp = round(4.0 + (t_surface - 4.0) * t_decay + random.uniform(-0.25, 0.25), 2)
            obs_sal = round(34.1 + (depth / 2800.0) * 1.2 + random.uniform(-0.1, 0.1), 2)
            obs_speed = round(max(0.04, 1.15 * math.exp(-depth / 320.0) + random.uniform(-0.08, 0.08)), 2)

            cursor.execute('''
                INSERT INTO observations (platform_id, timestamp, latitude, longitude, depth, temperature, salinity, current_speed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (platform_id, "2026-09-05T12:00:00Z", lat, lon, depth, obs_temp, obs_sal, obs_speed))

            # Numerical model simulation values with typical operational bias
            model_temp = round(obs_temp + random.uniform(-0.55, 0.65), 2)
            model_sal = round(obs_sal + random.uniform(-0.18, 0.18), 2)
            model_speed = round(obs_speed + random.uniform(-0.09, 0.09), 2)

            cursor.execute('''
                INSERT INTO model_grid (model_name, timestamp, latitude, longitude, depth, temperature, salinity, current_speed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', ("INCOIS-ROMS-V3", "2026-09-05T12:00:00Z", lat, lon, depth, model_temp, model_sal, model_speed))

    conn.commit()
    conn.close()
    print("Database built successfully at:", DB_PATH)

if __name__ == "__main__":
    init_db()