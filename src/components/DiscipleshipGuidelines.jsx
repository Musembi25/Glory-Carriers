const GUIDELINE_SECTIONS = [
  {
    id: "attendance",
    number: "01",
    title: "Class Attendance & Punctuality",
    points: [
      {
        label: "Consistency",
        text: "Attendance is mandatory. Discipleship is built on fellowship and consistent learning."
      },
      {
        label: "Punctuality",
        text: "Classes begin exactly at the scheduled time. Please arrive or log in 5–10 minutes early to prepare your heart and mind."
      },
      {
        label: "Absences",
        text: "If you must miss a class due to an emergency, you are required to notify your teacher or the class administrator in advance."
      }
    ]
  },
  {
    id: "conduct",
    number: "02",
    title: "Student Expectations & Conduct",
    points: [
      {
        label: "Active participation",
        text: "Students are expected to engage in discussions, ask questions, and participate in practical sessions."
      },
      {
        label: "Preparedness",
        text: "Always have your Bible, a dedicated notebook, and your course materials ready for every session."
      },
      {
        label: "Environment",
        text: "Ensure you are in a quiet, distraction-free environment during class hours."
      }
    ]
  },
  {
    id: "assignments",
    number: "03",
    title: "Assignments & Practical Tasks",
    points: [
      {
        label: "Timely submission",
        text: "Assignments are designed to deepen your walk with God. All tasks must be submitted by the deadline set by your teacher."
      },
      {
        label: "Integrity",
        text: "All reflections and written work should be your own heartfelt thoughts and study."
      },
      {
        label: "Late submissions",
        text: "Late assignments may result in a deduction of points or may not be accepted without a valid excuse."
      }
    ]
  },
  {
    id: "graduation",
    number: "04",
    title: "Graduation Requirements",
    intro:
      "Graduation from Discipleship 1 is not based on attendance alone, but on a demonstration of growth and commitment. To graduate, a student must:",
    checklist: [
      "Maintain a minimum attendance record of at least 80% of all classes.",
      "Complete and submit all weekly assignments.",
      "Complete the mandatory class project (required for graduation eligibility).",
      "Demonstrate a visible commitment to the spiritual disciplines taught during the course."
    ]
  },
  {
    id: "communication",
    number: "05",
    title: "Communication",
    points: [
      {
        label: "Group communication",
        text: "Keep all communication in this group respectful and focused on the course content."
      },
      {
        label: "Personal matters",
        text: "For personal matters or specific curriculum questions, please reach out to your assigned teacher directly."
      }
    ]
  }
];

export function DiscipleshipGuidelines() {
  return (
    <section className="discipleship-guidelines" aria-labelledby="discipleship-guidelines-title">
      <header className="discipleship-guidelines-hero">
        <p className="discipleship-guidelines-eyebrow">Discipleship 1 • Soldout Ministry</p>
        <h2 id="discipleship-guidelines-title">
          Essential Guidelines and Expectations
        </h2>
        <p className="discipleship-guidelines-lead">
          Dear Disciples, grace and peace to you in the name of our Lord Jesus Christ. As we
          embark on this transformative journey of Discipleship 1, we want every student to
          understand the path ahead. To maintain the sanctity and order of our learning
          environment, please adhere to the following class rules.
        </p>
      </header>

      <div className="discipleship-guidelines-grid">
        {GUIDELINE_SECTIONS.map((section) => (
          <article key={section.id} className="discipleship-guideline-card">
            <div className="discipleship-guideline-card-head">
              <span className="discipleship-guideline-number">{section.number}</span>
              <h3>{section.title}</h3>
            </div>

            {section.intro ? <p className="discipleship-guideline-intro">{section.intro}</p> : null}

            {section.points ? (
              <ul className="discipleship-guideline-list">
                {section.points.map((point) => (
                  <li key={point.label}>
                    <strong>{point.label}</strong>
                    <span>{point.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            {section.checklist ? (
              <ul className="discipleship-guideline-checklist">
                {section.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      <footer className="discipleship-guidelines-footer">
        <p>
          We are excited to see what the Holy Spirit will do in your lives over the coming weeks.
          Let us commit this process to the Lord.
        </p>
        <p className="discipleship-guidelines-signoff">
          <span>Blessings,</span>
          <strong>The Discipleship Coordination Team</strong>
          <em>Soldout Ministry</em>
        </p>
      </footer>
    </section>
  );
}
