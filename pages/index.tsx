
import { useMemo, useState } from "react";
import Head from "next/head";
import dietData from "../data/diet.json";
import workoutPlans from "../data/workouts.json";
import dynamic from "next/dynamic";
import type { ComponentType } from "react";

const ResponsiveContainer = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.ResponsiveContainer), { ssr:false });
const PieChart = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.PieChart), { ssr:false });
const Pie = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.Pie), { ssr:false });
const Cell = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.Cell), { ssr:false });
const TooltipChart = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.Tooltip), { ssr:false });
const BarChart = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.BarChart), { ssr:false });
const Bar = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.Bar), { ssr:false });
const XAxis = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.XAxis), { ssr:false });
const YAxis = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.YAxis), { ssr:false });
const CartesianGrid = dynamic<ComponentType<any>>(() => import("recharts").then(m=>m.CartesianGrid), { ssr:false });

type Sex = "male"|"female";
type Goal = "fat_loss"|"muscle_gain"|"maintain";
type DietPref = "balanced"|"indian_veg"|"indian_nonveg"|"vegan"|"nonveg_global";

const activityFactors: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };

function mifflin(sex:Sex, weightKg:number, heightCm:number, age:number){
  const base = 10*weightKg + 6.25*heightCm - 5*age;
  return sex==="male" ? base + 5 : base - 161;
}
function clamp(n:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, n)); }

function dailyCaloriesForTarget({
  sex, weightKg, heightCm, age, activity, currentWeight, targetWeight, weeks, explicitGoal
}: {
  sex: Sex; weightKg:number; heightCm:number; age:number; activity: keyof typeof activityFactors;
  currentWeight:number; targetWeight:number; weeks:number; explicitGoal: Goal;
}){
  const bmr = mifflin(sex, weightKg, heightCm, age);
  const tdee = bmr * activityFactors[activity];
  const days = Math.max(1, Math.round(weeks*7));
  const deltaKg = targetWeight - currentWeight; // negative if fat loss
  const totalKcalChange = deltaKg * 7700;
  const dailyChange = totalKcalChange / days;
  const cap = explicitGoal === "fat_loss" ? 1000 : explicitGoal === "muscle_gain" ? 600 : 0;
  const adjustedChange = clamp(dailyChange, -cap, cap);
  const targetCals = Math.round(tdee + adjustedChange);
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), targetCals, dailyChange: Math.round(dailyChange) };
}

type Meal = { id:string; name:string; calories:number; protein:number; carbs:number; fat:number; link:string; tags:string[] };

function filterMeals(meals: Meal[], pref: DietPref){
  return meals.filter(m => m.tags.includes(pref) || (pref==="balanced" && m.tags.includes("balanced")) || (pref==="nonveg_global" && m.tags.includes("nonveg_global")));
}
function buildMealPlan({ meals, totalCals, mealsPerDay }:{ meals: Meal[]; totalCals:number; mealsPerDay:number; }){
  const perMeal = totalCals / mealsPerDay;
  const plan: Meal[] = [];
  const pool = [...meals];
  for(let i=0;i<mealsPerDay;i++){
    let bestIdx = 0; let bestDiff = Infinity;
    for(let j=0;j<pool.length;j++){
      const d = Math.abs(pool[j].calories - perMeal);
      if(d < bestDiff){ bestDiff = d; bestIdx = j; }
    }
    plan.push(pool[bestIdx]);
    pool.splice(bestIdx,1);
  }
  const total = plan.reduce((s,m)=> s+m.calories, 0);
  const protein = plan.reduce((s,m)=> s+m.protein, 0);
  const carbs = plan.reduce((s,m)=> s+m.carbs, 0);
  const fat = plan.reduce((s,m)=> s+m.fat, 0);
  return { plan, totals: { calories: total, protein, carbs, fat } };
}

export default function Home(){
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
    restrictions: ""
  });

  const metrics = useMemo(()=> dailyCaloriesForTarget({
    sex: form.sex,
    weightKg: form.weightKg,
    heightCm: form.heightCm,
    age: form.age,
    activity: form.activity,
    currentWeight: form.weightKg,
    targetWeight: form.targetWeight,
    weeks: form.weeks,
    explicitGoal: form.goal
  }), [form]);

  const allergens = useMemo(()=> form.restrictions.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean), [form.restrictions]);

  const mealsFiltered = useMemo(()=> {
    const base = filterMeals(dietData as unknown as Meal[], form.dietPref);
    return base.filter(m=> !allergens.some(a => (m.name+" "+m.tags.join(" ")).toLowerCase().includes(a)));
  }, [form.dietPref, allergens]);

  const mealPlan = useMemo(()=> buildMealPlan({
    meals: mealsFiltered,
    totalCals: metrics.targetCals,
    mealsPerDay: form.mealsPerDay
  }), [mealsFiltered, metrics.targetCals, form.mealsPerDay]);

  const level = form.weeks <= 8 ? "beginner" : form.weeks <= 20 ? "intermediate" : "advanced";
  const workouts = useMemo(()=> {
    const all = workoutPlans as any[];
    return all.filter(w => w.goal === (form.goal==="maintain" ? "general_fitness" : form.goal) && w.level === level);
  }, [form.goal, level]);

  const macroData = [
    { name: "Protein (g)", value: mealPlan.totals.protein },
    { name: "Carbs (g)", value: mealPlan.totals.carbs },
    { name: "Fat (g)", value: mealPlan.totals.fat },
  ];

  return (
    <>
      <Head><title>Smart Fit Planner</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <main className="max-w-7xl mx-auto grid-gap md:grid-cols-3">
        <section className="md:col-span-1 glass rounded-2xl p-4 md:p-6">
          <h2 className="section-title mb-4">Your Profile</h2>
          <div className="grid gap-3">
            <label className="text-sm">Name
              <input className="input mt-1" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Your name" />
            </label>
            <label className="text-sm">Sex
              <select className="select mt-1" value={form.sex} onChange={e=>setForm({...form, sex: e.target.value as Sex})}>
                <option value="male">Male</option><option value="female">Female</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Age
                <input type="number" className="input mt-1" value={form.age} onChange={e=>setForm({...form, age: Number(e.target.value)})} />
              </label>
              <label className="text-sm">Height (cm)
                <input type="number" className="input mt-1" value={form.heightCm} onChange={e=>setForm({...form, heightCm: Number(e.target.value)})} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Current Weight (kg)
                <input type="number" className="input mt-1" value={form.weightKg} onChange={e=>setForm({...form, weightKg: Number(e.target.value)})} />
              </label>
              <label className="text-sm">Target Weight (kg)
                <input type="number" className="input mt-1" value={form.targetWeight} onChange={e=>setForm({...form, targetWeight: Number(e.target.value)})} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Timeframe (weeks)
                <input type="number" className="input mt-1" value={form.weeks} min={1} onChange={e=>setForm({...form, weeks: Math.max(1, Number(e.target.value))})} />
              </label>
              <label className="text-sm">Activity
                <select className="select mt-1" value={form.activity} onChange={e=>setForm({...form, activity: e.target.value as any})}>
                  <option value="sedentary">Sedentary</option>
                  <option value="light">Light (1–3 d/w)</option>
                  <option value="moderate">Moderate (3–5 d/w)</option>
                  <option value="active">Active (6–7 d/w)</option>
                  <option value="very">Very active</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">Meals / day (1–5)
                <input type="number" className="input mt-1" value={form.mealsPerDay} min={1} max={5} onChange={e=>setForm({...form, mealsPerDay: Math.max(1, Math.min(5, Number(e.target.value)))})} />
              </label>
              <label className="text-sm">Diet Preference
                <select className="select mt-1" value={form.dietPref} onChange={e=>setForm({...form, dietPref: e.target.value as DietPref})}>
                  <option value="balanced">Balanced</option>
                  <option value="indian_veg">Indian Vegetarian</option>
                  <option value="indian_nonveg">Indian Non-Veg</option>
                  <option value="vegan">Vegan</option>
                  <option value="nonveg_global">Global Non-Veg</option>
                </select>
              </label>
            </div>
            <label className="text-sm">Restrictions (comma separated)
              <input className="input mt-1" placeholder="e.g., peanuts, gluten" value={form.restrictions} onChange={e=>setForm({...form, restrictions:e.target.value})}/>
            </label>
          </div>
        </section>

        <section className="md:col-span-2 grid-gap">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="kpi"><div className="text-sm text-slate-600">BMR</div><div className="text-2xl font-semibold">{metrics.bmr} kcal</div></div>
            <div className="kpi"><div className="text-sm text-slate-600">TDEE</div><div className="text-2xl font-semibold">{metrics.tdee} kcal</div></div>
            <div className="kpi"><div className="text-sm text-slate-600">Target Calories</div><div className="text-2xl font-semibold">{metrics.targetCals} kcal</div><div className="text-xs text-slate-500">(daily change ≈ {metrics.dailyChange} kcal)</div></div>
            <div className="kpi"><div className="text-sm text-slate-600">Meals</div><div className="text-2xl font-semibold">{form.mealsPerDay} / day</div></div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="card h-72">
              <h3 className="font-semibold mb-2">Daily Macros (from plan)</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={macroData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {macroData.map((_,i)=>(<Cell key={i} fill={["#6366F1","#06B6D4","#10B981"][i%3]} />))}
                    </Pie>
                    <TooltipChart />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card h-72">
              <h3 className="font-semibold mb-2">Macros Bar</h3>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={macroData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <TooltipChart />
                    <Bar dataKey="value">
                      {macroData.map((_,i)=>(<Cell key={i} fill={["#6366F1","#06B6D4","#10B981"][i%3]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title mb-3">Your Meal Plan ({form.mealsPerDay} meals)</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {mealPlan.plan.map((m, idx)=>(
                <div key={m.id+idx} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.name}</div>
                    <a href={m.link} target="_blank" className="text-blue-600 text-sm underline">Recipe</a>
                  </div>
                  <div className="text-sm text-slate-600">{m.calories} kcal • {m.protein}P / {m.carbs}C / {m.fat}F</div>
                  <div className="text-xs text-slate-500">{m.tags.join(", ")}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-sm text-slate-700"><strong>Daily total:</strong> {mealPlan.totals.calories} kcal — {mealPlan.totals.protein}P / {mealPlan.totals.carbs}C / {mealPlan.totals.fat}F</div>
          </div>

          <div className="card">
            <h3 className="section-title mb-3">Tailored Workouts ({(form.goal==="maintain" ? "general_fitness" : form.goal)} • {level})</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {(workoutPlans as any[]).filter(w => w.goal === (form.goal==="maintain" ? "general_fitness" : form.goal) && w.level === level).map((w:any)=>(
                <div key={w.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{w.title}</div>
                    <a href={w.link} target="_blank" className="text-blue-600 text-sm underline">Learn</a>
                  </div>
                  <ul className="list-disc pl-5 text-sm mt-1">
                    {w.blocks.map((b:any, i:number)=>(
                      <li key={i}>
                        <span className="font-medium">{b.name}</span>
                        {b.sets ? ` — ${b.sets}` : ""}
                        {b.duration ? ` — ${b.duration}` : ""}
                        {b.rest ? ` — Rest ${b.rest}` : ""}
                        {b.tip ? ` — ${b.tip}` : ""}
                        {" "}
                        <a href={b.link || "https://exrx.net/"} target="_blank" className="text-blue-500 underline">video</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
