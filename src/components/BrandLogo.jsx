import groupLogo from "../../logo.png";
import { APP_NAME, CELL_GROUP_NAME } from "../lib/identity";

export function BrandLogo({ compact = false }) {
  return (
    <div className={compact ? "brand-logo compact" : "brand-logo"}>
      <img src={groupLogo} alt={`${APP_NAME} logo`} className="brand-logo-mark" />
      <div className="brand-logo-copy">
        <strong>{APP_NAME}</strong>
        {!compact ? <span>{CELL_GROUP_NAME}</span> : null}
      </div>
    </div>
  );
}
