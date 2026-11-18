import { useEffect, useState } from "react";
import { nowBrasiliaLabel } from "../datetime";

export default function Clock() {
  const [label, setLabel] = useState(nowBrasiliaLabel);

  useEffect(() => {
    const id = window.setInterval(() => setLabel(nowBrasiliaLabel()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <time className="clock" dateTime={new Date().toISOString()} aria-label={label}>
      {label}
    </time>
  );
}
