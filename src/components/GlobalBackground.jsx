import { memo, useEffect, useState } from "react";

const assetBase = import.meta.env.BASE_URL;
const imageSources = [
  assetBase + "community/backgrounds/11.jpeg",
  assetBase + "community/backgrounds/13.jpeg"
];

if (typeof Image !== "undefined") {
  imageSources.forEach((source) => {
    const preload = new Image();
    preload.decoding = "async";
    preload.fetchPriority = "high";
    preload.src = source;
  });
}

function GlobalBackground({ activeSection }) {
  const [rotationIndex, setRotationIndex] = useState(0);
  const isBibleStudy = activeSection === "bible-study";

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const timer = window.setInterval(() => {
      setRotationIndex((current) => (current + 1) % imageSources.length);
    }, 16000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleIndex = isBibleStudy ? 1 : rotationIndex;

  return (
    <div className="app-global-background" data-page={isBibleStudy ? "bible-study" : "default"} data-active-section={activeSection} aria-hidden="true">
      {imageSources.map((source, index) => (
        <img
          key={source}
          className={"app-global-background-image" + (visibleIndex === index ? " is-active" : "")}
          src={source}
          alt=""
          draggable="false"
          loading="eager"
          decoding="async"
          fetchPriority={visibleIndex === index ? "high" : "low"}
        />
      ))}
      <span className="app-global-background-overlay" />
    </div>
  );
}

export default memo(GlobalBackground);
