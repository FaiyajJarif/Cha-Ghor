import NoticeBoard from "../../components/worker/NoticeBoard";

// খবর ও নোটিশ — its own feature, not a card on the profile.
//
// WHY SEPARATE
//   These are two different jobs and they belong to different people. A notice
//   is the ESTATE talking to the worker — weather, shift changes, field
//   closures, raised by a supervisor. প্রশাসককে রিপোর্ট is the worker talking
//   back. Putting the incoming messages inside "my profile" made them look like
//   a detail of the worker's record rather than the estate's voice, and buried
//   the one thing that is genuinely time-critical: "no work tomorrow" is
//   useless if it is read the next afternoon.
//
//   Given its own entry it also gets a place in the sidebar a worker can learn,
//   which matters more here than anywhere else in the app.
//
// The board itself lives in components/worker/NoticeBoard so the same code can
// be embedded elsewhere later — a summary on the home screen, say — without the
// filtering rules being written twice.
export default function WorkerNotices() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-[#14493B]">খবর ও নোটিশ</h1>
        <p className="text-sm text-[#14493B]/60">
          সুপারভাইজার ও অফিস থেকে পাঠানো খবর — আবহাওয়া, কাজের সময়, ক্ষেত্রের
          অবস্থা
        </p>
      </div>

      {/* showEmpty, because on a page of its own an empty board must say so
          rather than render nothing at all. */}
      <NoticeBoard showEmpty />
    </div>
  );
}
