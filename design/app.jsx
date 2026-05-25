// recovery-trail dashboard — 3 distinct directions
// Single design canvas hosting three iPhone artboards.

const { useState } = React;

// Wrap each direction in the IOSDevice frame.
function PhoneArtboard({ Direction }) {
  return (
    <IOSDevice dark width={402} height={874}>
      <Direction />
    </IOSDevice>
  );
}

function App() {
  return (
    <DesignCanvas>
      <DCSection
        id="recovery-trail"
        title="recovery-trail · dashboard redesign"
        subtitle="Three distinct compositions of the same data — narrative, glanceable, dense."
        gap={64}
      >
        <DCArtboard id="a-note"    label="A · The Note — narrative"   width={402} height={874}>
          <PhoneArtboard Direction={DirectionA} />
        </DCArtboard>
        <DCArtboard id="b-dial"    label="B · The Dial — glanceable"  width={402} height={874}>
          <PhoneArtboard Direction={DirectionB} />
        </DCArtboard>
        <DCArtboard id="c-heatmap" label="C · The Heatmap — dense"    width={402} height={874}>
          <PhoneArtboard Direction={DirectionC} />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
