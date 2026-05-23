export default function HeavyComponent() {
  return (
    <div className="p-8 bg-zinc-100 rounded-lg dark:bg-zinc-800 my-8">
      <h2 className="text-xl font-bold mb-4">Heavy Interactive Component</h2>
      <p>This component is dynamically loaded to reduce the initial bundle size. In a real app, this might be a complex map, a chart library, or a heavy third-party widget.</p>
    </div>
  );
}
