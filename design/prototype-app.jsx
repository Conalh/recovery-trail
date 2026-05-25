// Mounts the interactive C direction inside a phone frame, centered.

function App() {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'radial-gradient(circle at 50% 35%, #1a1f25 0%, #0a0c0f 65%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
      boxSizing: 'border-box',
    }}>
      <IOSDevice dark width={402} height={874}>
        <div style={{
          width: '100%', height: '100%', overflowY: 'auto',
          background: '#0b1015',
        }}>
          <DirectionC />
        </div>
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
