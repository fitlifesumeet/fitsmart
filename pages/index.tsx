// pages/index.tsx
import { useMemo, useState, useEffect } from "react";
import Head from "next/head";
import dietData from "../data/diet.json";
import workoutPlans from "../data/workouts.json";

/* ===================== Types & Helpers ===================== */

type Sex = "male" | "female";
type Goal = "fat_loss" | "muscle_gain" | "maintain" | "endurance";
type DietPref =
  | "balanced"
  | "indian_veg"
  | "indian_nonveg"
  | "vegan"
  | "nonveg_global";

const activityFactors: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

function mifflin(sex: Sex, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function dailyCaloriesForTarget({
  sex,
  weightKg,
  heightCm,
  age,
  activity,
  currentWeight,
  targetWeight,
  weeks,
  explicitGoal,
}: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: keyof typeof activityFactors;
  currentWeight: number;
  targetWeight: number;
  weeks: number;
  explicitGoal: Goal;
}) {
  const bmr = mifflin(sex, weightKg, heightCm, age);
  const tdee = bmr * activityFactors[activity];
  const days = Math.max(1, Math.round(weeks * 7));
  const deltaKg = targetWeight - currentWeight;
  const totalKcalChange = deltaKg * 7700;
  const dailyChange = totalKcalChange / days;

  // cap the daily change based on goal to keep things sane
  const cap =
    explicitGoal === "fat_loss" ? 1000 : explicitGoal === "muscle_gain" ? 600 : 0;
  const adjustedChange = clamp(dailyChange, -cap, cap);
  const targetCals = Math.round(tdee + adjustedChange);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCals,
    dailyChange: Math.round(dailyChange),
  };
}

type Meal = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  link: string;
  tags: string[];
};

function filterMeals(meals: Meal[], pref: DietPref) {
  return meals.filter(
    (m) =>
      m.tags.includes(pref) ||
      (pref === "balanced" && m.tags.includes("balanced")) ||
      (pref === "nonveg_global" && m.tags.includes("nonveg_global"))
  );
}

function buildMealPlan({
  meals,
  totalCals,
  mealsPerDay,
}: {
  meals: Meal[];
  totalCals: number;
  mealsPerDay: number;
}) {
  const perMeal = totalCals / mealsPerDay;
  const plan: Meal[] = [];
  const pool = [...meals];

  for (let i = 0; i < mealsPerDay; i++) {
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let j = 0; j < pool.length; j++) {
      const d = Math.abs(pool[j].calories - perMeal);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = j;
      }
    }
    plan.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }

  const totals = plan.reduce(
    (acc, m) => {
      acc.calories += m.calories;
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return { plan, totals };
}

/* ===================== Main Component ===================== */

export default function Home() {
  const [form, setForm] = useState({
    name: "",
    sex: "male" as Sex,
    age: 30,
    heightCm: 175,
    weightKg: 90,
    activity: "light" as keyof typeof activityFactors, // keep in sync with select below
    targetWeight: 75,
    weeks: 16,
    goal: "fat_loss" as Goal,
    mealsPerDay: 2,
    dietPref: "indian_veg" as DietPref,
    restrictions: "",
  });

  /** ---- Lazy-load Recharts on client only (prevents SSR mismatch) ---- */
  const [Recharts, setRecharts] = useState<any | null>(null);
  useEffect(() => {
    let mounted = true;
    import("recharts")
      .then((mod) => {
        if (mounted) setRecharts(mod);
      })
      .catch((err) => {
        console.error("Failed to load recharts:", err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /** ---- Metrics ---- */
  const metrics = useMemo(
    () =>
      dailyCaloriesForTarget({
        sex: form.sex,
        weightKg: form.weightKg,
        heightCm: form.heightCm,
        age: form.age,
        activity: form.activity,
        currentWeight: form.weightKg,
        targetWeight: form.targetWeight,
        weeks: form.weeks,
        explicitGoal: form.goal,
      }),
    [form]
  );

  /** ---- Allergy/Restriction handling ---- */
  const allergens = useMemo(
    () =>
      form.restrictions
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [form.restrictions]
  );

  /** ---- Meals (filtered) ---- */
  const mealsFiltered = useMemo(() => {
    const base = filterMeals(dietData as unknown as Meal[], form.dietPref);
    return base.filter(
      (m) =>
        !allergens.some((a) =>
          (m.name + " " + m.tags.join(" ")).toLowerCase().includes(a)
        )
    );
  }, [form.dietPref, allergens]);

  /** ---- Meal Plan (balanced to target calories) ---- */
  const mealPlan = useMemo(
    () =>
      buildMealPlan({
        meals: mealsFiltered,
        totalCals: metrics.targetCals,
        mealsPerDay: form.mealsPerDay,
      }),
    [mealsFiltered, metrics.targetCals, form.mealsPerDay]
  );

  /** ---- Level from timeframe (as in your original) ---- */
  const level =
    form.weeks <= 8 ? "beginner" : form.weeks <= 20 ? "intermediate" : "advanced";

  /** ---- Workout filtering + smart fallbacks ----
   * Your JSON uses `goal`, `level`, and `blocks` (not `exercises`).
   * Also, you have `general_fitness` for "maintain".
   * We filter by goal+level; if none, we fall back to goal only, then to level only, then show all.
   */
  const workouts = useMemo(() => {
    const all = workoutPlans as any[];
    const normalizedGoal =
      form.goal === "maintain" ? "general_fitness" : form.goal;

    let filtered = all.filter(
      (w) => w.goal === normalizedGoal && w.level === level
    );

    if (!filtered.length) {
      filtered = all.filter((w) => w.goal === normalizedGoal);
    }
    if (!filtered.length) {
      filtered = all.filter((w) => w.level === level);
    }
    if (!filtered.length) {
      filtered = all;
    }

    return filtered;
  }, [form.goal, level]);

  const macroData = [
    { name: "Protein (g)", value: mealPlan.totals.protein },
    { name: "Carbs (g)", value: mealPlan.totals.carbs },
    { name: "Fat (g)", value: mealPlan.totals.fat },
  ];

  /* ===================== JSX ===================== */

  return (
    <>
      <Head>
        <title>Smart Fit Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="max-w-7xl mx-auto grid-gap md:grid-cols-3">
        {/* ===== Left: Profile Form ===== */}
        <section className="md:col-span-1 glass rounded-2xl p-4 md:p-6">
          <h2 className="section-title mb-4">Your Profile</h2>

          <div className="grid gap-3">
            {/* Name */}
            <label className="text-sm">
              Name
              <input
                className="input mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your name"
              />
            </label>

            {/* Sex */}
            <label className="text-sm">
              Sex
              <select
                className="select mt-1"
                value={form.sex}
                onChange={(e) =>
                  setForm({ ...form, sex: e.target.value as Sex })
                }
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>

            {/* Age & Height */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Age
                <input
                  type="number"
                  className="input mt-1"
                  value={form.age}
                  onChange={(e) =>
                    setForm({ ...form, age: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-sm">
                Height (cm)
                <input
                  type="number"
                  className="input mt-1"
                  value={form.heightCm}
                  onChange={(e) =>
                    setForm({ ...form, heightCm: Number(e.target.value) })
                  }
                />
              </label>
            </div>

            {/* Weight & Target */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Current Weight (kg)
                <input
                  type="number"
                  className="input mt-1"
                  value={form.weightKg}
                  onChange={(e) =>
                    setForm({ ...form, weightKg: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-sm">
                Target Weight (kg)
                <input
                  type="number"
                  className="input mt-1"
                  value={form.targetWeight}
                  onChange={(e) =>
                    setForm({ ...form, targetWeight: Number(e.target.value) })
                  }
                />
              </label>
            </div>

            {/* Timeframe & Activity */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Timeframe (weeks)
                <input
                  type="number"
                  className="input mt-1"
                  value={form.weeks}
                  min={1}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      weeks: Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Activity
                <select
                  className="select mt-1"
                  value={form.activity}
                  onChange={(e) =>
                    setForm({ ...form, activity: e.target.value as any })
                  }
                >
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light (1–3 d/w)</option>
                  <option value="moderate">Moderate (3–5 d/w)</option>
                  <option value="active">Active (6–7 d/w)</option>
                  <option value="very">Very active</option>
                </select>
              </label>
            </div>

            {/* Goal (now visible) */}
            <label className="text-sm">
              Goal
              <select
                className="select mt-1"
                value={form.goal}
                onChange={(e) =>
                  setForm({ ...form, goal: e.target.value as Goal })
                }
              >
                <option value="fat_loss">Fat Loss</option>
                <option value="muscle_gain">Muscle Gain</option>
                <option value="maintain">Maintain / General Fitness</option>
                <option value="endurance">Endurance</option>
              </select>
            </label>

            {/* Meals per day & Diet */}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Meals / day (1–5)
                <input
                  type="number"
                  className="input mt-1"
                  value={form.mealsPerDay}
                  min={1}
                  max={5}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      mealsPerDay: Math.max(
                        1,
                        Math.min(5, Number(e.target.value))
                      ),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Diet Preference
                <select
                  className="select mt-1"
                  value={form.dietPref}
                  onChange={(e) =>
                    setForm({ ...form, dietPref: e.target.value as DietPref })
                  }
                >
                  <option value="balanced">Balanced</option>
                  <option value="indian_veg">Indian Vegetarian</option>
                  <option value="indian_nonveg">Indian Non-Veg</option>
                  <option value="vegan">Vegan</option>
                  <option value="nonveg_global">Global Non-Veg</option>
                </select>
              </label>
            </div>

            {/* Restrictions */}
            <label className="text-sm">
              Restrictions (comma separated)
              <input
                className="input mt-1"
                placeholder="e.g., peanuts, gluten"
                value={form.restrictions}
                onChange={(e) =>
                  setForm({ ...form, restrictions: e.target.value })
                }
              />
            </label>
          </div>
        </section>

        {/* ===== Right: Results ===== */}
        <section className="md:col-span-2 grid-gap">
          {/* KPIs */}
          <div className="grid md:grid-cols-4 gap-4">
            <div className="kpi">
              <div className="text-sm text-slate-600">BMR</div>
              <div className="text-2xl font-semibold">{metrics.bmr} kcal</div>
            </div>
            <div className="kpi">
              <div className="text-sm text-slate-600">TDEE</div>
              <div className="text-2xl font-semibold">{metrics.tdee} kcal</div>
            </div>
            <div className="kpi">
              <div className="text-sm text-slate-600">Target Calories</div>
              <div className="text-2xl font-semibold">{metrics.targetCals} kcal</div>
              <div className="text-xs text-slate-500">
                (daily change ≈ {metrics.dailyChange} kcal)
              </div>
            </div>
            <div className="kpi">
              <div className="text-sm text-slate-600">Meals</div>
              <div className="text-2xl font-semibold">{form.mealsPerDay} / day</div>
            </div>
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card h-72">
              <h3 className="font-semibold mb-2">Daily Macros (from plan)</h3>
              <div className="h-60">
                {Recharts ? (
                  <div style={{ width: "100%", height: "100%" }}>
                    <Recharts.ResponsiveContainer width="100%" height="100%">
                      <Recharts.PieChart>
                        <Recharts.Pie
                          data={macroData}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={90}
                          label
                        >
                          {macroData.map((_, i) => (
                            <Recharts.Cell
                              key={i}
                              fill={["#6366F1", "#06B6D4", "#10B981"][i % 3]}
                            />
                          ))}
                        </Recharts.Pie>
                        <Recharts.Tooltip />
                      </Recharts.PieChart>
                    </Recharts.ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    Loading chart...
                  </div>
                )}
              </div>
            </div>

            <div className="card h-72">
              <h3 className="font-semibold mb-2">Macros Bar</h3>
              <div className="h-60">
                {Recharts ? (
                  <div style={{ width: "100%", height: "100%" }}>
                    <Recharts.ResponsiveContainer width="100%" height="100%">
                      <Recharts.BarChart data={macroData}>
                        <Recharts.CartesianGrid strokeDasharray="3 3" />
                        <Recharts.XAxis dataKey="name" />
                        <Recharts.YAxis />
                        <Recharts.Tooltip />
                        <Recharts.Bar dataKey="value">
                          {macroData.map((_, i) => (
                            <Recharts.Cell
                              key={i}
                              fill={["#6366F1", "#06B6D4", "#10B981"][i % 3]}
                            />
                          ))}
                        </Recharts.Bar>
                      </Recharts.BarChart>
                    </Recharts.ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    Loading chart...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Meal Plan */}
          <div className="card">
            <h3 className="section-title mb-3">
              Your Meal Plan ({form.mealsPerDay} meals)
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              {mealPlan.plan.map((m, idx) => (
                <div key={m.id + idx} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.name}</div>
                    <a
                      href={m.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm underline"
                    >
                      Recipe
                    </a>
                  </div>
                  <div className="text-sm text-slate-600">
                    {m.calories} kcal • {m.protein}P / {m.carbs}C / {m.fat}F
                  </div>
                  <div className="text-xs text-slate-500">
                    {m.tags.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workout Plan */}
          <div className="card mt-4">
            <h3 className="section-title mb-3">Workout Plan</h3>

            {/* Little hint to explain fallback behavior */}
            <div className="text-xs text-slate-500 mb-2">
              Showing workouts for <b>{form.goal}</b> &ldquo;{level}&rdquo;. If no exact
              match exists in your data, we show the closest matches.
            </div>

            {workouts.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {workouts.map((w: any, i: number) => (
                  <div key={w.id ?? i} className="rounded-xl border p-3">
                    {/* Title */}
                    <div className="font-medium text-lg">
                      {w.title ?? w.name ?? `Plan ${i + 1}`}
                    </div>

                    {/* Meta */}
                    <div className="text-xs text-slate-500 mb-1">
                      Goal: {w.goal} | Level: {w.level}
                      {w.type ? ` | Type: ${w.type}` : ""}
                    </div>

                    {/* Optional link */}
                    {w.link && (
                      <a
                        href={w.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        Reference
                      </a>
                    )}

                    {/* Blocks (your JSON) */}
                    {Array.isArray(w.blocks) && w.blocks.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {w.blocks.map((block: any, idx: number) => (
                          <li key={idx} className="border-t pt-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{block.name}</span>
                              <span className="text-slate-600">
                                {block.sets
                                  ? block.sets
                                  : block.duration
                                  ? block.duration
                                  : ""}
                                {block.rest ? ` • Rest: ${block.rest}` : ""}
                              </span>
                            </div>

                            {block.tip && (
                              <div className="text-xs text-slate-500">
                                Tip: {block.tip}
                              </div>
                            )}

                            {block.link && (
                              <a
                                href={block.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 underline"
                              >
                                Demo
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : // In case some items still use `exercises`, render them too.
                    Array.isArray(w.exercises) && w.exercises.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm">
                        {w.exercises.map((ex: any, idx: number) => (
                          <li key={idx} className="border-t pt-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{ex.name}</span>
                              <span className="text-slate-600">
                                {ex.sets} × {ex.reps}
                                {ex.rest ? ` • Rest: ${ex.rest}` : ""}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        No exercises listed.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No workouts found for this goal/level.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="card mt-4">
            <h3 className="section-title mb-3">Notes</h3>
            <textarea
              className="input w-full"
              rows={4}
              placeholder="Write your fitness notes here..."
            />
          </div>
        </section>
      </main>
    </>
  );
}
