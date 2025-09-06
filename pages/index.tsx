// pages/index.tsx
import { useMemo, useState, useEffect } from "react";
import Head from "next/head";
import dietData from "../data/diet.json";
import workoutPlans from "../data/workouts.json";

// ---------------- Types & Helpers ----------------
type Sex = "male" | "female";
type Goal = "fat_loss" | "muscle_gain" | "maintain";
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
  const cap =
    explicitGoal === "fat_loss"
      ? 1000
      : explicitGoal === "muscle_gain"
      ? 600
      : 0;
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
  const total = plan.reduce((s, m) => s + m.calories, 0);
  const protein = plan.reduce((s, m) => s + m.protein, 0);
  const carbs = plan.reduce((s, m) => s + m.carbs, 0);
  const fat = plan.reduce((s, m) => s + m.fat, 0);
  return { plan, totals: { calories: total, protein, carbs, fat } };
}

// ---------------- Main Component ----------------
export default function Home() {
  const [form, setForm] = useState({
    name: "",
    sex: "male" as Sex,
    age: 30,
    heightCm: 175,
    weightKg: 90,
    activity: "moderate" as keyof typeof activityFactors,
    targetWeight: 75,
    weeks: 16,
    goal: "fat_loss" as Goal,
    mealsPerDay: 2,
    dietPref: "indian_veg" as DietPref,
    restrictions: "",
  });

  // Recharts module will be loaded client-side
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

  const allergens = useMemo(
    () =>
      form.restrictions
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    [form.restrictions]
  );

  const mealsFiltered = useMemo(() => {
    const base = filterMeals(dietData as unknown as Meal[], form.dietPref);
    return base.filter(
      (m) =>
        !allergens.some((a) =>
          (m.name + " " + m.tags.join(" ")).toLowerCase().includes(a)
        )
    );
  }, [form.dietPref, allergens]);

  const mealPlan = useMemo(
    () =>
      buildMealPlan({
        meals: mealsFiltered,
        totalCals: metrics.targetCals,
        mealsPerDay: form.mealsPerDay,
      }),
    [mealsFiltered, metrics.targetCals, form.mealsPerDay]
  );

  const level =
    form.weeks <= 8 ? "beginner" : form.weeks <= 20 ? "intermediate" : "advanced";

  const workouts = useMemo(() => {
    const all = workoutPlans as any[];
    return all.filter(
      (w) =>
        w.goal === (form.goal === "maintain" ? "general_fitness" : form.goal) &&
        w.level === level
    );
  }, [form.goal, level]);

  const macroData = [
    { name: "Protein (g)", value: mealPlan.totals.protein },
    { name: "Carbs (g)", value: mealPlan.totals.carbs },
    { name: "Fat (g)", value: mealPlan.totals.fat },
  ];

  return (
    <>
      <Head>
        <title>Smart Fit Planner</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="max-w-7xl mx-auto grid-gap md:grid-cols-3">
        {/* Profile Form */}
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

        {/* Results Section */}
        <section className="md:col-span-2 grid-gap">
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
                  <div className="text-xs text-slate-500">{m.tags.join(", ")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Workout Plan */}
          <div className="card mt-4">
            <h3 className="section-title mb-3">Workout Plan</h3>
            {workouts.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-3">
                {workouts.map((w, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <div className="font-medium">{w.title ?? w.name ?? `Plan ${i + 1}`}</div>
                    <div className="text-sm text-slate-600">{w.description ?? w.desc ?? ""}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No workouts found for this goal/level.</p>
            )}
          </div>

          {/* Notes */}
          <div className="card mt-4">
            <h3 className="section-title mb-3">Notes</h3>
            <textarea className="input w-full" rows={4} placeholder="Write your fitness notes here..." />
          </div>
        </section>
      </main>
    </>
  );
}
