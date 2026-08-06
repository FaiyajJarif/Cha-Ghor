import { LuLinkedin, LuFacebook, LuTwitter } from "react-icons/lu";
import Logo from "./Logo";

const COLS = [
  {
    head: "Solutions",
    items: [
      "Tea Garden Management",
      "Large Estates",
      "Small Farms",
      "Labor Management",
      "Production Tracking",
    ],
  },
  {
    head: "Company",
    items: ["About Us", "Our Team", "Careers", "Projects", "Contact Us"],
  },
  { head: "Resources", items: ["Help Center", "Documentation", "FAQs"] },
  {
    head: "Legal",
    items: ["Privacy Policy", "Terms of Service", "Cookie Policy", "Security"],
  },
];

const SOCIALS = [LuLinkedin, LuFacebook, LuTwitter];

export default function Footer() {
  return (
    <footer className="bg-cg-darker text-white/80">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-5">
        <div>
          <Logo light />
          <p className="mt-4 text-sm font-semibold text-white">
            Follow Cha Ghor:
          </p>
          <div className="mt-3 flex gap-2">
            {SOCIALS.map((Icon, i) => (
              <a
                key={i}
                href="#"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition-all duration-200 hover:-translate-y-0.5 hover:bg-cg-green hover:text-white"
              >
                <Icon />
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed">
            House 12, Iqbal Road, Dhanmondi,
            <br />
            Dhaka 1207, Bangladesh
            <br />
            +880 1673-014526
            <br />
            contact@chaghor.com
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.head}>
            <h4 className="text-sm font-bold text-white">{c.head}</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {c.items.map((i) => (
                <li
                  key={i}
                  className="cursor-pointer transition-colors hover:text-white"
                >
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        Cha Ghor © 2026
      </div>
    </footer>
  );
}
