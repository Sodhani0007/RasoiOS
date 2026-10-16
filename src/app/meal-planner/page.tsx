import Link from "next/link";
import {
  CalendarDays,
  Users,
  Package,
  BookOpen,
  ArrowRight,
} from "lucide-react";
export default function Page() {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">A LITTLE LESS “AAJ KYA BANEGA?”</div>
          <h1>Meal planner</h1>
          <p>Your kitchen’s next chapter.</p>
        </div>
      </div>
      <section className="card coming-soon">
        <span className="large-icon">
          <CalendarDays size={44} />
        </span>
        <span className="badge amber">COMING IN PHASE 2 / 3</span>
        <h2>A plan that understands your household.</h2>
        <p>
          Future meal planning will bring together individual dietary rules,
          serving sizes and ingredients on hand. No meals are being recommended
          or scheduled in Phase 1.
        </p>
        <div className="preparation-links">
          <Link href="/household">
            <Users /> Choose participants <ArrowRight size={16} />
          </Link>
          <Link href="/inventory">
            <Package /> Update your pantry <ArrowRight size={16} />
          </Link>
          <Link href="/recipes">
            <BookOpen /> Save family recipes <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
