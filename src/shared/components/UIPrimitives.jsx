import "./UIPrimitives.css";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export function Button({ as: Component = "button", variant = "primary", size = "medium", className = "", type, ...props }) {
  return <Component
    className={classes("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)}
    {...(Component === "button" ? { type: type || "button" } : {})}
    {...props}
  />;
}

export function Card({ as: Component = "div", density = "comfortable", interactive = false, className = "", ...props }) {
  return <Component
    className={classes("ui-card", `ui-card--${density}`, interactive && "ui-card--interactive", className)}
    {...props}
  />;
}

export function Badge({ tone = "neutral", size = "standard", className = "", ...props }) {
  return <span className={classes("ui-badge", `ui-badge--${tone}`, `ui-badge--${size}`, className)} {...props} />;
}
