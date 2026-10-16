import Link from "next/link";
import { CookingPot, Users, ArrowRight } from "lucide-react";
export function Home() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR KITCHEN, TOGETHER</div>
          <h1>RasoiOS</h1>
          <p>The Kitchen That Remembers, Decides & Coordinates</p>
        </div>
      </div>
      <div className="portal-summary view-choices">
        <Link href="/family" className="card view-choice">
          <Users size={36} />
          <h2>
            Enter Family View <ArrowRight size={22} />
          </h2>
          <p>
            Choose your profile, plan your meals and share what you would love
            to eat.
          </p>
        </Link>
        <Link href="/cook" className="card view-choice">
          <CookingPot size={36} />
          <h2>
            Enter Cook View <ArrowRight size={22} />
          </h2>
          <p>
            Read family choices, follow approved recipes and keep everyone
            updated on preparation.
          </p>
        </Link>
      </div>
      <p className="muted">
        A shared kitchen for your trusted household. Switch views freely.
      </p>
      <Link href="/dashboard" className="text-button">
        View household overview →
      </Link>
    </>
  );
}
