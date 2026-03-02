"use client";

import { Montserrat } from "next/font/google";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Blocks,
  BadgeCheck,
  ClipboardList,
  FileClock,
  Gauge,
  LockKeyhole,
  Radar,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SecurityShowcase } from "@/components/shared/SecurityShowcase";
import { Container } from "@/components/ui/Container";
import { GlassCard } from "@/components/ui/GlassCard";
import { PillButton } from "@/components/ui/PillButton";
import { Section } from "@/components/ui/Section";
import { spacing, typography } from "@/lib/design-system";
import { getHeroMotion } from "@/lib/hero-motion";
import { useGovernance } from "@/lib/use-governance";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800"],
});

const navSections = [
  { id: "product", label: "Product" },
  { id: "how", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "mission", label: "Mission" },
] as const;

const howPipelineSteps = [
  {
    title: "Planner Agent",
    description:
      "Turns your request into a clear plan.",
    icon: ClipboardList,
  },
  {
    title: "Builder Agent",
    description: "Generates a proposed diff. No blind deploys.",
    icon: Sparkles,
  },
  {
    title: "Security Scanner",
    description:
      "Finds risky patterns like secrets, unsafe SQL, and token logging.",
    icon: ShieldCheck,
  },
  {
    title: "Risk Engine",
    description:
      "Scores risk and picks the right control path.",
    icon: TriangleAlert,
  },
  {
    title: "Human Gate (when needed)",
    description:
      "Humans approve, reject, or request changes.",
    icon: BadgeCheck,
  },
  {
    title: "Deployer Agent",
    description:
      "Applies changes only after all checks pass.",
    icon: Rocket,
  },
] as const;

const featureCards = [
  {
    title: "Confidence Modes",
    description:
      "From assistant to autopilot, per task.",
    icon: Gauge,
  },
  {
    title: "Agent Orchestration",
    description:
      "Planner, Builder, Verifier, and Operator in one flow.",
    icon: Workflow,
  },
  {
    title: "Security Scanner",
    description:
      "Automatic checks for common unsafe patterns.",
    icon: ShieldCheck,
  },
  {
    title: "Risk Engine & Policy Gates",
    description:
      "Routes changes to allow, review, or block.",
    icon: Radar,
  },
  {
    title: "Audit Logs & Traceability",
    description:
      "Clear history of prompts, diffs, and approvals.",
    icon: FileClock,
  },
  {
    title: "Enterprise-ready Controls",
    description:
      "Role-based approvals and safe overrides.",
    icon: LockKeyhole,
  },
] as const;

const faqItems = [
  {
    question: "Can Codex push changes without review?",
    answer:
      "No. High-risk actions require human approval before deploy.",
  },
  {
    question: "How do we track what the agents changed?",
    answer:
      "Every step logs prompts, diffs, risk results, and approvals.",
  },
  {
    question: "What happens when security or risk checks fail?",
    answer:
      "The pipeline blocks the run, shows reasons, and asks for fixes or approvals.",
  },
] as const;

export default function Home() {
  const router = useRouter();
  const { mode } = useGovernance();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const missionSectionRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<string>("product");
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({
    container: scrollContainerRef,
  });
  const { scrollYProgress: missionProgress } = useScroll({
    container: scrollContainerRef,
    target: missionSectionRef,
    offset: ["start end", "end start"],
  });
  const missionParallaxY = useTransform(missionProgress, [0, 1], [-28, 28]);

  const scrollToSection = useCallback((id: string) => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const target = container.querySelector<HTMLElement>(`#${id}`);
    if (!target) {
      return;
    }

    const topOffset = 104;
    const targetPosition =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      topOffset;

    const startPosition = container.scrollTop;
    const distance = targetPosition - startPosition;
    const duration = shouldReduceMotion
      ? 0
      : Math.min(900, Math.max(520, Math.abs(distance) * 0.85));
    const startTime = performance.now();
    container.dataset.programmaticScroll = "true";

    if (shouldReduceMotion) {
      container.scrollTop = targetPosition;
      delete container.dataset.programmaticScroll;
      return;
    }

    const animateScroll = (currentTime: number) => {
      const elapsed = Math.min((currentTime - startTime) / duration, 1);
      const easedProgress =
        elapsed < 0.5
          ? 4 * elapsed * elapsed * elapsed
          : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
      container.scrollTop = startPosition + distance * easedProgress;

      if (elapsed < 1) {
        window.requestAnimationFrame(animateScroll);
      } else {
        window.setTimeout(() => {
          delete container.dataset.programmaticScroll;
        }, 80);
      }
    };

    window.requestAnimationFrame(animateScroll);
  }, [shouldReduceMotion]);

  const handleNavClick = (id: string) => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
    scrollToSection(id);
  };

  const getRevealMotion = (delay = 0) => {
    if (shouldReduceMotion) {
      return {
        initial: { opacity: 1, y: 0 },
        whileInView: { opacity: 1, y: 0 },
        transition: { duration: 0, delay: 0, ease: "easeOut" as const },
      };
    }

    return {
      initial: { opacity: 0, y: 24 },
      whileInView: { opacity: 1, y: 0 },
      transition: { duration: 0.62, delay, ease: "easeOut" as const },
    };
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (mostVisible?.target?.id) {
          setActiveSection(mostVisible.target.id);
        }
      },
      {
        root: container,
        threshold: [0.35, 0.5, 0.75],
        rootMargin: "-20% 0px -45% 0px",
      }
    );

    navSections.forEach((section) => {
      const element = container.querySelector(`#${section.id}`);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleHashNavigation = () => {
      const hashId = window.location.hash.replace("#", "");
      if (!hashId) {
        return;
      }
      scrollToSection(hashId);
    };

    handleHashNavigation();
    window.addEventListener("hashchange", handleHashNavigation);
    return () => window.removeEventListener("hashchange", handleHashNavigation);
  }, [scrollToSection]);

  return (
    <div className="relative h-screen overflow-hidden bg-[#020617] text-white">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[2px] bg-white/10">
        <motion.div
          className="h-full origin-left bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-300"
          style={{ scaleX: scrollYProgress }}
        />
      </div>
      <div
        className="absolute inset-0 z-0 bg-center bg-no-repeat opacity-50"
        style={{
          backgroundImage: shouldReduceMotion ? "none" : "url('/bg4.gif')",
          backgroundSize: "95% auto",
        }}
      />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(30,64,175,0.2),transparent_60%)]" />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/20 via-black/60 to-[#010314]" />

      <div
        ref={scrollContainerRef}
        className="scroll-shell relative z-10 h-screen overflow-y-auto"
      >
        <Container className="stable-nav sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-white/12 bg-black/25 py-4 backdrop-blur-md">
          <div className="text-sm font-medium tracking-wide text-white/85">codex ai</div>
          <nav className="hidden items-center gap-1 rounded-full border border-white/20 bg-black/20 px-3 py-2 text-sm text-white/80 backdrop-blur-md md:flex">
            {navSections.map((section) => (
              <button
                key={section.id}
                aria-current={activeSection === section.id ? "page" : undefined}
                className={`relative rounded-full px-3 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:text-sm ${
                  activeSection === section.id
                    ? "text-white"
                    : "text-white/80 hover:text-white"
                }`}
                type="button"
                onClick={() => handleNavClick(section.id)}
              >
                {section.label}
                {activeSection === section.id ? (
                  <motion.span
                    layoutId="active-nav-underline"
                    className="absolute -bottom-1 left-2 right-2 h-[2px] rounded-full bg-white"
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 430, damping: 32 }
                    }
                  />
                ) : null}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <PillButton variant="primary" size="sm" onClick={() => router.push("/auth")}>
              Login / Sign up
            </PillButton>
          </div>
        </Container>

        <Section className={`${spacing.container} ${spacing.heroSection} flex flex-col items-center justify-center text-center`}>
          <motion.p
            {...getHeroMotion(shouldReduceMotion, 0.05, 8)}
            className={`mb-10 ${typography.eyebrow}`}
          >
            GOVERNED AI ENGINEERING
          </motion.p>
          <motion.h1
            {...getHeroMotion(shouldReduceMotion, 0.15)}
            className={`${montserrat.className} ${typography.hero} max-w-3xl text-white`}
          >
            Build faster, stay in control
          </motion.h1>
          <motion.p
            {...getHeroMotion(shouldReduceMotion, 0.28, 10)}
            className={`mt-3 max-w-2xl ${typography.body}`}
          >
            Build, review, and ship with AI speed and human oversight.
          </motion.p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <PillButton
              variant="outline"
              size="lg"
              className="hover:shadow-[0_0_14px_rgba(96,165,250,0.22)]"
              onClick={() => router.push("/confidence")}
            >
              START NOW
            </PillButton>
          </div>
          <button
            type="button"
            className="scroll-indicator mt-14 text-xs tracking-[0.2em] text-white/70 hover:text-white"
            onClick={() => handleNavClick("product")}
          >
            Scroll down
          </button>
        </Section>

        <Section
          id="product"
          className={`${spacing.container} ${spacing.contentSection} flex items-center`}
        >
          <div className="grid w-full gap-6 lg:grid-cols-2">
            <motion.div
              {...getRevealMotion(0.08)}
              viewport={{ once: true, amount: 0.3 }}
              className="flex items-center"
            >
              <GlassCard className="w-full">
                <p className={`${typography.eyebrow}`}>Product</p>
                <h2 className={`${typography.h2} mt-4 text-white`}>
                  AI speed with governance built in.
                </h2>
                <p className={`mt-5 max-w-2xl ${typography.body}`}>
                  Codex helps across the SDLC. You set autonomy. Scanners and risk
                  checks keep unsafe changes from shipping.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-white/85">
                  <li>Confidence Scale controls how much Codex can do</li>
                  <li>Multi-agent workflow (Plan → Build → Verify)</li>
                  <li>Safety gates (Scan + Risk) before deploy</li>
                </ul>
              </GlassCard>
            </motion.div>

            <motion.div
              {...getRevealMotion(0.18)}
              viewport={{ once: true, amount: 0.3 }}
              className="grid gap-4"
            >
              <GlassCard className="w-full">
                <h3 className="text-lg font-semibold text-white">Confidence Scale</h3>
                <div className="mt-4 rounded-2xl border border-white/15 bg-black/40 p-4">
                  <div className="relative h-2 rounded-full bg-white/10">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-violet-400 to-cyan-300 opacity-80" />
                    <motion.div
                      className="absolute -top-1 h-4 w-4 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                      style={{ left: "29%" }}
                      animate={
                        shouldReduceMotion
                          ? undefined
                          : { left: ["29%", "50%", "100%", "50%", "29%"] }
                      }
                      transition={
                        shouldReduceMotion
                          ? undefined
                          : { duration: 4.2, repeat: Infinity, ease: "easeInOut" }
                      }
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/70">
                    <span>0-29</span>
                    <span>50</span>
                    <span>100</span>
                  </div>
                </div>
              </GlassCard>

              <div className="grid gap-4 sm:grid-cols-2">
                <GlassCard className="w-full">
                  <h3 className="text-base font-semibold text-white">Speed</h3>
                  <p className="mt-2 text-sm text-white/82">
                    Faster delivery with guided autonomy.
                  </p>
                </GlassCard>
                <GlassCard className="w-full">
                  <h3 className="text-base font-semibold text-white">Governance</h3>
                  <p className="mt-2 text-sm text-white/82">
                    Human approvals and role boundaries stay on by default.
                  </p>
                </GlassCard>
              </div>

              <GlassCard className="w-full">
                <h3 className="text-base font-semibold text-white">Safety</h3>
                <p className="mt-2 text-sm text-white/82">
                  Scan + risk checks block dangerous changes before deploy.
                </p>
              </GlassCard>
            </motion.div>
          </div>
        </Section>

        <Section
          id="how"
          className={`${spacing.container} ${spacing.contentSection} flex items-center`}
        >
          <div className="w-full">
            <motion.div
              {...getRevealMotion(0.06)}
              viewport={{ once: true, amount: 0.35 }}
            >
              <GlassCard className="w-full">
                <p className={`${typography.eyebrow}`}>How it works</p>
                <h2 className={`${typography.h2} mt-4 text-white`}>
                  A pipeline built to prevent catastrophic AI changes.
                </h2>

                <div className="relative mt-8 overflow-hidden pb-2">
                  <motion.div
                    className="absolute left-4 right-4 top-9 hidden h-px origin-left bg-gradient-to-r from-blue-400/70 via-cyan-300/65 to-blue-400/70 lg:block"
                    initial={{ scaleX: 0, opacity: shouldReduceMotion ? 1 : 0.6 }}
                    whileInView={{ scaleX: 1, opacity: 1 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.85, ease: "easeOut" }}
                  />

                  <div className="flex gap-4 overflow-x-auto pb-3 lg:grid lg:grid-cols-6 lg:overflow-visible">
                    {howPipelineSteps.map((step, index) => {
                      const Icon = step.icon;
                      return (
                        <motion.div
                          key={step.title}
                          {...getRevealMotion(0.1 + index * 0.05)}
                          viewport={{ once: true, amount: 0.25 }}
                          className="min-w-[260px] lg:min-w-0"
                        >
                          <GlassCard className="h-full p-6">
                            <div className="mb-4 inline-flex rounded-xl border border-white/20 bg-white/5 p-2">
                              <Icon className="h-5 w-5 text-blue-200" />
                            </div>
                            <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-white/82">
                              {step.description}
                            </p>
                          </GlassCard>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <motion.div
                  {...getRevealMotion(0.2)}
                  viewport={{ once: true, amount: 0.3 }}
                  className="mt-6 rounded-2xl border border-amber-300/35 bg-amber-300/8 px-4 py-3 text-sm font-medium text-amber-100"
                >
                  Human approval required when risk is high.
                </motion.div>

                <p className="mt-6 text-sm text-white/80">
                  Every action is logged. Any risky step can be stopped.
                </p>
              </GlassCard>
            </motion.div>
          </div>
        </Section>

        <Section
          id="features"
          className={`${spacing.container} ${spacing.contentSection} flex items-center`}
        >
          <div className="w-full">
            <motion.div
              {...getRevealMotion(0.06)}
              viewport={{ once: true, amount: 0.35 }}
            >
              <GlassCard className="w-full">
                <div className="flex items-center gap-2">
                  <Blocks className="h-4 w-4 text-blue-200" />
                  <p className={`${typography.eyebrow}`}>Features</p>
                </div>
                <h2 className={`${typography.h2} mt-4 text-white`}>Features</h2>

                <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {featureCards.map((feature, index) => {
                    const Icon = feature.icon;
                    return (
                      <motion.div
                        key={feature.title}
                        {...getRevealMotion(0.1 + index * 0.04)}
                        viewport={{ once: true, amount: 0.25 }}
                        className="h-full"
                      >
                        <GlassCard className="group h-full translate-y-0 border-white/15 bg-black/30 p-6 transition-transform duration-300 hover:-translate-y-0.5 hover:border-blue-300/30 hover:shadow-[0_0_16px_rgba(56,189,248,0.16)]">
                          <motion.div
                            className="mb-4 inline-flex rounded-xl border border-white/20 bg-white/5 p-2"
                            animate={
                              shouldReduceMotion
                                ? undefined
                                : {
                                    y: [0, -2, 0],
                                    rotate: [0, -2, 0, 2, 0],
                                  }
                            }
                            transition={
                              shouldReduceMotion
                                ? undefined
                                : {
                                    duration: 3.6 + index * 0.2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                  }
                            }
                          >
                            <Icon className="h-5 w-5 text-blue-100" />
                          </motion.div>
                          <h3 className="text-base font-semibold text-white">
                            {feature.title}
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-white/82">
                            {feature.description}
                          </p>
                        </GlassCard>
                      </motion.div>
                    );
                  })}
                </div>

                <p className="mt-7 text-sm text-white/80">
                  Governance helps teams scale safely.
                </p>
                <SecurityShowcase mode={mode} compact />
              </GlassCard>
            </motion.div>
          </div>
        </Section>

        <Section
          id="mission"
          ref={missionSectionRef}
          className={`${spacing.container} ${spacing.contentSection} relative flex items-center`}
        >
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-1/2 -z-10 h-44 rounded-full bg-gradient-to-r from-cyan-300/10 via-blue-400/14 to-violet-300/10 blur-2xl"
            style={{ y: shouldReduceMotion ? 0 : missionParallaxY }}
          />

          <motion.div
            {...getRevealMotion(0.08)}
            viewport={{ once: true, amount: 0.35 }}
            className="w-full"
          >
            <GlassCard className="w-full border-white/15 bg-black/25 p-7 md:p-8">
              <p className={`${typography.eyebrow}`}>Mission</p>
              <h2 className={`${typography.h2} mt-4 max-w-3xl text-white`}>
                Make AI speed trustworthy.
              </h2>
              <p className={`mt-6 max-w-3xl ${typography.body}`}>
                AI writes more code every day. Teams still need accountability.
                Keep humans in control, make risk measurable, and make every
                deploy explainable.
              </p>
              <p className="mt-7 text-sm font-medium text-white/85">
                Safe autonomy is the future of engineering.
              </p>
            </GlassCard>
          </motion.div>
        </Section>

        <Section
          id="faq"
          className={`${spacing.container} ${spacing.contentSection} flex items-center`}
        >
          <motion.div
            {...getRevealMotion(0.08)}
            viewport={{ once: true, amount: 0.35 }}
            className="w-full"
          >
            <GlassCard className="w-full border-white/15 bg-black/28 p-6 md:p-7">
              <p className={`${typography.eyebrow}`}>FAQ</p>
              <h2 className={`${typography.h2} mt-4 text-white`}>
                Frequently asked questions
              </h2>
              <div className="mt-6 space-y-3">
                {faqItems.map((item) => (
                  <details
                    key={item.question}
                    className="rounded-2xl border border-white/14 bg-black/30 p-4"
                  >
                    <summary className="cursor-pointer list-none rounded-md text-left text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                      <h3 className="inline">{item.question}</h3>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-white/85">
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        </Section>

      </div>
    </div>
  );
}
