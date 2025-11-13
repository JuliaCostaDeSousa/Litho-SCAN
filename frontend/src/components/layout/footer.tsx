export default function Footer() {
  return (
    <div className="flex items-center justify-between">
      <span>© {new Date().getFullYear()} Litho-SCAN</span>
      <span className="opacity-70">v0.1</span>
    </div>
  );
}