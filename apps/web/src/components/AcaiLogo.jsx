/**
 * The AçaIA mark: three açaí berries and a palm leaf. Decorative by default.
 * @param {{ size?: number, className?: string }} props
 */
export default function AcaiLogo({ size = 32, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M33 13C35 6 42 2 50 3c-2 7-9 11-17 10z" fill="var(--leaf-500)" />
      <circle cx="21" cy="40" r="15" fill="var(--acai-700)" />
      <circle cx="43" cy="40" r="15" fill="var(--acai-800)" />
      <circle cx="32" cy="25" r="14" fill="var(--acai-600)" />
      <circle cx="27" cy="20" r="3.5" fill="#fff" opacity=".35" />
      <circle cx="16" cy="35" r="3" fill="#fff" opacity=".25" />
      <circle cx="38" cy="35" r="3" fill="#fff" opacity=".2" />
    </svg>
  );
}
