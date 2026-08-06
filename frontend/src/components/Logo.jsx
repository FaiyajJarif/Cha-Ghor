import { LuLeaf } from "react-icons/lu";

export default function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-cg-green text-lg text-white">
        <LuLeaf />
      </span>
      <span
        className={`text-xl font-extrabold ${light ? "text-white" : "text-cg-ink"}`}
      >
        Cha <span className="text-cg-green">Ghor</span>
      </span>
    </div>
  );
}
