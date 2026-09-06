import { useState } from "react";
import "./App.css";
import OceanScene from "./OceanScene";

type OceanPoint = {
  id: string;
  latitude: number;
  longitude: number;
  temperature: number;
};

const oceanData: OceanPoint[] = [
  {
    id: "point_001",
    latitude: 20.5,
    longitude: 87.5,
    temperature: 24.6,
  },
  {
    id: "point_002",
    latitude: 10.0,
    longitude: 90.0,
    temperature: 27.2,
  },
  {
    id: "point_003",
    latitude: -5.0,
    longitude: 120.0,
    temperature: 29.1,
  },
  {
    id: "point_004",
    latitude: 30.0,
    longitude: 60.0,
    temperature: 18.5,
  },
  {
    id: "point_005",
    latitude: -15.0,
    longitude: 100.0,
    temperature: 31.0,
  },
];

function App() {
  const [selectedPoint, setSelectedPoint] =
    useState<OceanPoint>(oceanData[0]);

  return (
    <div className="app">

      <header className="header">
        <div>
          <h1>🌊 Ocean Visualization Platform</h1>

          <p>
            Interactive numerical model & in-situ
            observation viewer
          </p>
        </div>

        <div className="status">
          ● System Ready
        </div>
      </header>

      <main className="dashboard">

        {/* DATA CONTROLS */}
        <section className="control-panel">

          <h2>Data Controls</h2>

          <label>Parameter</label>

          <select>
            <option>Temperature</option>
            <option>Salinity</option>
            <option>Current Speed</option>
          </select>

          <label>Depth</label>

          <input
            type="range"
            min="0"
            max="5000"
            defaultValue="100"
          />

          <p>Depth: 100 m</p>

          <label>Time</label>

          <input
            type="range"
            min="0"
            max="24"
            defaultValue="12"
          />

          <p>Time: 12:00</p>

        </section>

        {/* 3D OCEAN VIEW */}
        <section className="ocean-view">

          <div className="globe">
            <OceanScene
              onPointSelect={setSelectedPoint}
            />
          </div>

          <h2>3D Ocean View</h2>

          <p>
            Click an ocean data point to inspect
            its measurements.
          </p>

        </section>

        {/* DATA PANEL */}
        <section className="data-panel">

          <h2>Observation Data</h2>

          <div className="data-card">
            <span>Selected Point</span>

            <strong>
              {selectedPoint.id}
            </strong>
          </div>

          <div className="data-card">
            <span>Latitude</span>

            <strong>
              {selectedPoint.latitude}°
            </strong>
          </div>

          <div className="data-card">
            <span>Longitude</span>

            <strong>
              {selectedPoint.longitude}°
            </strong>
          </div>

          <div className="data-card">
            <span>Temperature</span>

            <strong>
              {selectedPoint.temperature} °C
            </strong>
          </div>

          <div className="data-card">
            <span>Model Value</span>

            <strong>
              {selectedPoint.temperature} °C
            </strong>
          </div>

          <div className="data-card">
            <span>Observed Value</span>

            <strong>
              24.1 °C
            </strong>
          </div>

          <div className="data-card">
            <span>Difference</span>

            <strong>
              0.5 °C
            </strong>
          </div>

        </section>

      </main>

      <footer>
        SIH 2026 • Ocean Data Visualization Platform
      </footer>

    </div>
  );
}

export default App;