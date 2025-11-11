const fileInput = document.getElementById('fileInput');

fileInput.addEventListener('change', (event) => {
  const fileList = event.target.files; // FileList object
  
  if (fileList.length > 0) {
    const selectedFile = fileList[0]; // Access the first selected file
  }
});

const generatebtn = document.getElementById('generate-btn');
generatebtn.addEventListener('click', () => {
    const fileList = fileInput.files;
    const file = fileList.length > 0 ? fileList[0] : null;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;

        // Assuming the gyro file is a text file with space-separated values
        if (typeof content === "string") {
          // normalize lines and drop empty ones
          const rawLines = content.split(/\r?\n/).map(l => l.replace(/\r/g, ""));
          const lines = rawLines.map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length === 0) return;

          // choose separator: prefer two-or-more spaces or tabs (common for column-aligned exports),
          // otherwise fall back to any whitespace
          const detectSep = (s) => (/\s{2,}|\t+/.test(s) ? /\s{2,}|\t+/ : /\s+/);
          const sep = detectSep(lines[0]);

          const parseLine = (line, sepRegex) =>
            line.split(sepRegex).map(tok => tok.trim()).filter(tok => tok.length > 0);

          // header keys
          const keys = parseLine(lines[0], sep);

          // parse rows, with a fallback to single-whitespace split if lengths don't match
          const tableValues = lines.slice(1);
          const parsed = tableValues.map(line => {
            let values = parseLine(line, sep);
            if (values.length < keys.length) {
              values = parseLine(line, /\s+/);
            }
            const entry = {};
            keys.forEach((key, i) => {
              const raw = values[i] ?? "";
              const num = Number(raw);
              entry[key] = raw === "" ? "" : (isNaN(num) ? raw : num);
            });
            return entry;
          });

          // convert to coordinates and set plot data
            const coordinates = imuRowsToCoordinates(parsed);

            Plotly.newPlot('graph', [{
                type: 'scatter3d',
                mode: 'lines',
                x: coordinates.map(p => p.x),
                y: coordinates.map(p => p.y),
                z: coordinates.map(p => p.z),
                opacity: 1,
                line: {
                    width: 6,
                    reversescale: false
                }
                }], {});
        }
        // Further processing to generate graph can be done here
      };
      reader.readAsText(file);
    } else {
      alert("Please upload a gyro file first.");
    }
});


function imuRowsToCoordinates(rows) {
    let position = { x: 0, y: 0, z: 0 };
    let velocity = { x: 0, y: 0, z: 0 };
    let prevTime = Date.parse(rows[0]["time"]);

    const coordinates = [];

    rows.forEach((row) => {
      // Convert acceleration from g → m/s²
      const ax = parseFloat(row["AccX(g)"]) * 9.80665;
      const ay = parseFloat(row["AccY(g)"]) * 9.80665;
      const az = parseFloat(row["AccZ(g)"]) * 9.80665;

      // Quaternion values
      const q0 = parseFloat(row["Q0()"]) / 1000;  // WT901 scales Q0 by 1000
      const q1 = parseFloat(row["Q1()"]);
      const q2 = parseFloat(row["Q2()"]);
      const q3 = parseFloat(row["Q3()"]);

      // Quaternion → rotation matrix
      const R = [
        [1 - 2 * (q2*q2 + q3*q3),     2 * (q1*q2 - q0*q3),     2 * (q1*q3 + q0*q2)],
        [2 * (q1*q2 + q0*q3),         1 - 2 * (q1*q1 + q3*q3), 2 * (q2*q3 - q0*q1)],
        [2 * (q1*q3 - q0*q2),         2 * (q2*q3 + q0*q1),     1 - 2 * (q1*q1 + q2*q2)]
      ];

      // Rotate acceleration into world coordinate frame
      const worldAccel = {
        x: R[0][0] * ax + R[0][1] * ay + R[0][2] * az,
        y: R[1][0] * ax + R[1][1] * ay + R[1][2] * az,
        z: R[2][0] * ax + R[2][1] * ay + R[2][2] * az
      };

      // Calculate Δt between samples (seconds)
      const dt = (Date.parse(row["time"]) - prevTime) / 1000;
      prevTime = Date.parse(row["time"]);

      // Integrate acceleration → velocity
      velocity.x += worldAccel.x * dt;
      velocity.y += worldAccel.y * dt;
      velocity.z += worldAccel.z * dt;

      // Integrate velocity → position
      position.x += velocity.x * dt;
      position.y += velocity.y * dt;
      position.z += velocity.z * dt;

      coordinates.push({ ...position });
    });

    return coordinates;
}