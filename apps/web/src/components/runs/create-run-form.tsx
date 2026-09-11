"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import type { RunCreateRequest } from "@nextflow-genomics-object-storage/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateRun, useRunInputs, useSeedDemoInputs } from "@/lib/queries";

const NONE = "__none__";

const schema = z.object({
  name: z.string().min(1, "Give the run a name").max(120),
  pipeline: z.enum(["demo", "nf-core/sarek", "nf-core/rnaseq"]),
  profile: z.enum(["test", "docker", "singularity", "standard"]),
  samplesheet: z.string(),
});

type FormValues = z.infer<typeof schema>;

const PIPELINES: { value: FormValues["pipeline"]; label: string }[] = [
  { value: "demo", label: "demo — bundled, Docker-free" },
  { value: "nf-core/sarek", label: "nf-core/sarek (needs containers)" },
  { value: "nf-core/rnaseq", label: "nf-core/rnaseq (needs containers)" },
];

const PROFILES: FormValues["profile"][] = [
  "test",
  "docker",
  "singularity",
  "standard",
];

function suggestedName() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return `cohort-${ymd}`;
}

export function CreateRunDialog({
  initial,
  trigger,
}: {
  initial?: Partial<RunCreateRequest>;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createRun = useCreateRun();
  const { data: inputs = [] } = useRunInputs();
  const seedInputs = useSeedDemoInputs();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? "",
      pipeline: initial?.pipeline ?? "demo",
      profile: initial?.profile ?? "test",
      samplesheet: initial?.samplesheet ?? "",
    },
  });

  const onSeedInputs = () =>
    seedInputs.mutate(undefined, {
      onSuccess: (result) => {
        toast.success("Demo inputs seeded", {
          description: `Uploaded ${result.sample_count} FASTQ file(s) and a samplesheet to inputs/.`,
        });
        form.setValue("samplesheet", result.samplesheet);
      },
      onError: (err) =>
        toast.error("Could not seed demo inputs", { description: err.message }),
    });

  // Safe default (not an autofill button): once inputs load, preselect the
  // seeded synthetic samplesheet if the user hasn't chosen one yet. The
  // empty-value guard makes this idempotent and never overrides a real choice.
  useEffect(() => {
    if (initial?.samplesheet || form.getValues("samplesheet")) return;
    if (inputs.length === 0) return;
    const seeded =
      inputs.find((k) => k.includes("demo-samplesheet")) ?? inputs[0];
    form.setValue("samplesheet", seeded);
  }, [inputs, initial, form]);

  const onSubmit = (values: FormValues) => {
    const payload: RunCreateRequest = {
      name: values.name.trim(),
      pipeline: values.pipeline,
      profile: values.profile,
      samplesheet:
        values.samplesheet && values.samplesheet !== NONE
          ? values.samplesheet
          : null,
    };
    createRun.mutate(payload, {
      onSuccess: (run) => {
        toast.success("Run created", {
          description: `${run.name} is ready to launch.`,
        });
        setOpen(false);
        form.reset();
        router.push(`/runs/${run.run_id}`);
      },
      onError: (err) => {
        toast.error("Could not create run", { description: err.message });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5" />
            New run
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New pipeline run</DialogTitle>
          <DialogDescription>
            Configure a Nextflow run. Its inputs are staged from Backblaze B2 and
            its results are published back to B2 (workDir runs on local disk). A
            launched run is immutable — to change inputs later, clone it into a
            new run.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Run name / cohort label</FormLabel>
                  <FormControl>
                    <Input placeholder={suggestedName()} {...field} />
                  </FormControl>
                  <FormDescription>
                    A free-text label for this cohort, e.g. {suggestedName()}.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pipeline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PIPELINES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Default <code>demo</code> runs anywhere Nextflow + Java are
                    installed — no Docker, no reference genome.
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PROFILES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Default <code>test</code> pairs with the demo pipeline.
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="samplesheet"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Samplesheet (from B2 inputs/)</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value || NONE}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a samplesheet" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {inputs.map((key) => (
                        <SelectItem key={key} value={key}>
                          {key.split("/").pop()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {inputs.length === 0
                      ? "No samplesheets found."
                      : "Discovered under inputs/. The seeded demo samplesheet is preselected."}
                  </FormDescription>
                  {/* Always offered, not just when inputs.length === 0: the
                      /upload page copy unconditionally points users here to
                      (re)seed the demo dataset, and seeding is idempotent
                      (see services/api/app/service/inputs.py), so re-running
                      it once a samplesheet already exists is a safe reset. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit"
                    disabled={seedInputs.isPending}
                    onClick={onSeedInputs}
                  >
                    {seedInputs.isPending
                      ? "Seeding demo inputs…"
                      : inputs.length === 0
                        ? "Seed demo inputs"
                        : "Re-seed demo inputs"}
                  </Button>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                disabled={createRun.isPending}
              >
                {createRun.isPending ? "Creating…" : "Create run"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
