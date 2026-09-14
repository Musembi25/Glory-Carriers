const groupLogo = `${import.meta.env.BASE_URL}icons/icon-512.png`;

export function BrandLogo({ compact = false }) {
  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      <img src={groupLogo} alt="Glory Carriers logo" className="brand-logo-mark" />
      <div className="brand-logo-copy">
        <strong>Glory Carriers</strong>
        {!compact ? <span>Plan together beautifully</span> : null}
      </div>
    </div>
  );
}
