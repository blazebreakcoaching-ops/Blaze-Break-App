/**
 * Blaze Break's approved brand assets, selected automatically by theme.
 * Keep this single source of truth across the web app. The gradient mark
 * comes from the user's supplied light logo; the white-ring mark is the
 * existing dark logo in public/brand.
 */
export function BlazeBrandLogo({
  className = "",
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={["ember-logo", "ember-brandmark", className].filter(Boolean).join(" ")}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Blaze Break"}
      aria-hidden={decorative ? true : undefined}
    >
      <img src="/brand/ember-logo-light.svg" alt="" className="block h-full w-full object-contain dark:hidden" />
      <img src="/brand/flame-mark-dark.png" alt="" className="hidden h-full w-full object-contain dark:block" />
    </span>
  );
}
