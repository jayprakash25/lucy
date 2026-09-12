"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Profile = Record<string, string>;
type Campaign = { objective: string; destination: string; cta: string; destinationDetail: string; targetLocation: string; audience: string; budgetType: string; dailyBudget: string; startDate: string; duration: string; placements: string[] };
type State = { proposal: null | { status: string }; operations: Array<{ id: string; operation_type: string; status: string; remote_id: string | null; last_error: string | null }> };

const today = new Date().toISOString().slice(0, 10);

export default function DemoPage() {
  const [stage, setStage] = useState(1);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [proposalId, setProposalId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [creativeVersion, setCreativeVersion] = useState(0);
  const [creativeHash, setCreativeHash] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>({ proposal: null, operations: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const headline = profile ? `${profile.configuration ?? ""} ${profile.propertyType ?? "Property"} at ${profile.projectName ?? ""}` : "";
  const copy = profile ? `${profile.configuration ?? ""} ${(profile.propertyType ?? "Property").toLowerCase()} in ${profile.locality ?? ""}, ${profile.city ?? ""}. ${profile.usp ?? ""} Starting at ${profile.price ?? ""}. ${profile.amenities ?? ""}` : "";
  const total = useMemo(() => campaign ? Number(campaign.dailyBudget) * Number(campaign.duration) : 0, [campaign]);

  function choosePhotos(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, 10);
    photoUrls.forEach(URL.revokeObjectURL);
    setPhotos(files); setPhotoUrls(files.map(URL.createObjectURL));
  }

  async function makeCreative(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!photos.length) return setError("Add at least one property photo.");
    setBusy(true);
    try {
      const nextProfile = Object.fromEntries(new FormData(event.currentTarget)) as Profile;
      const created = await workflowCommand({ action: "create", propertyProfile: nextProfile, mediaManifest: photos.map(file => ({ kind: "photo", name: file.name, type: file.type, size: file.size })) });
      const saved = await workflowCommand({ action: "saveCreative", workflowId: created.id, format: nextProfile.format === "Reel ad" ? "reel" : "image", content: { headline: `${nextProfile.configuration} ${nextProfile.propertyType} at ${nextProfile.projectName}`, primaryText: `${nextProfile.usp} Starting at ${nextProfile.price}.`, brandColors: nextProfile.brandColors, contact: nextProfile.phone } });
      setWorkflowId(created.id); setCreativeVersion(saved.creative.version); setCreativeHash(saved.creative.contentHash); setProfile(nextProfile); setStage(2); scrollTo(0, 0);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the workflow."); }
    finally { setBusy(false); }
  }

  async function configure(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const next = { ...(Object.fromEntries(data) as Omit<Campaign, "placements">), placements: data.getAll("placements") as string[] };
    setBusy(true); try { await workflowCommand({ action: "saveCampaign", workflowId, configuration: next }); setCampaign(next); setStage(4); scrollTo(0, 0); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save campaign configuration."); } finally { setBusy(false); }
  }

  async function recordCampaign() {
    if (!profile || !photos[0]) return;
    setBusy(true); setError("");
    try {
      const body = new FormData();
      for (const key of ["projectName", "locality", "city", "price", "configuration", "area"] as const) body.set(key, profile[key] ?? "");
      body.set("amenities", [profile.features, profile.amenities, profile.usp].filter(Boolean).join(", ")); body.set("photo", photos[0]);
      const response = await fetch("/api/demo/proposals", { method: "POST", body }); const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setProposalId(result.proposalId); setToken(result.token); await refresh(result.proposalId); setStage(5);
      await workflowCommand({ action: "attachProposal", workflowId, proposalId: result.proposalId });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not record the campaign."); }
    finally { setBusy(false); }
  }

  async function refresh(id = proposalId) { const response = await fetch(`/api/demo/proposals/${id}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setState(result); }
  async function approveCreative() { setBusy(true); setError(""); try { await workflowCommand({ action: "approveCreative", workflowId, version: creativeVersion, contentHash: creativeHash }); setStage(4); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not approve creative."); } finally { setBusy(false); } }
  async function decide(action: "approve" | "change" | "cancel") { setBusy(true); setError(""); try { const response = await fetch("/api/demo/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId, workflowId, token, action }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setState(result); } catch (caught) { setError(caught instanceof Error ? caught.message : "Decision failed."); } finally { setBusy(false); } }

  return <main className="console-shell full-workflow">
    <header className="console-header"><Link href="/" className="brand"><span className="brand-mark">L</span>Lucy</Link><div className="mode-badge"><span /> Safe mock mode</div></header>
    <section className="workflow-title"><div><h1>Property facts to a reviewed campaign.</h1><p>Creative approval and campaign approval are separate. Nothing publishes before Approval #2.</p></div><span className="safety-note">No real spend</span></section>
    <nav className="progress-rail five-steps">{["Property", "Creative", "Approval #1", "Campaign", "Approval #2"].map((label, i) => <button type="button" key={label} onClick={() => i + 1 < stage && setStage(i + 1)} className={stage >= i + 1 ? "progress-step is-active" : "progress-step"}><span>{i + 1}</span>{label}</button>)}</nav>
    {error && <div className="console-error"><strong>Couldn’t continue.</strong> {error}</div>}

    {stage === 1 && <Panel title="Build the property profile" note="This profile is the source for every ad claim."><form className="property-form expanded-form" onSubmit={makeCreative}>
      <FormGroup title="Property information"><Grid columns="three"><Field label="Property name *" name="projectName" value="Lucy Heights" /><Select label="Property type *" name="propertyType" options={["Apartment", "Villa", "Plot", "Commercial property"]} /><Field label="Configuration *" name="configuration" value="3 BHK" /><Field label="Locality *" name="locality" value="Sector 50" /><Field label="City *" name="city" value="Gurugram" /><Field label="Dimensions / total area *" name="area" value="1,650 sq ft" /><Field label="Pricing *" name="price" value="INR 1.25 Crore" /><Field label="Key highlight / USP *" name="usp" value="Ready-to-move homes near the metro" /></Grid><Grid columns="two"><Area label="Features" name="features" value="Spacious balconies, modular kitchen, covered parking" /><Area label="Amenities" name="amenities" value="Pool, gym, clubhouse, 24/7 security" /></Grid></FormGroup>
      <FormGroup title="Media and brand"><div className="media-grid"><Upload label="Property photos *" detail={photos.length ? `${photos.length} selected` : "Up to 10 JPEG or PNG files"} accept="image/jpeg,image/png" multiple onChange={choosePhotos} /><Upload label="Property video" detail={video?.name ?? "MP4 or WebM for a reel"} accept="video/mp4,video/webm" onChange={x => setVideo(x?.[0] ?? null)} /><Upload label="Brand logo" detail={logo?.name ?? "PNG or JPEG"} accept="image/png,image/jpeg" onChange={x => setLogo(x?.[0] ?? null)} /></div><Grid columns="three"><Select label="Ad format *" name="format" options={["Image ad", "Reel ad"]} /><Field label="Brand colors" name="brandColors" value="Forest green, warm ivory" /><Field label="Visual style" name="visualStyle" value="Premium, warm, architectural" /></Grid></FormGroup>
      <FormGroup title="Contact information"><Grid columns="three"><Field label="Contact name *" name="contactName" value="Lucy Sales Team" /><Field label="Phone / WhatsApp *" name="phone" value="+91 99999 99999" /><Field label="Email" name="email" value="sales@lucyheights.example" type="email" /></Grid></FormGroup>
      <button className="done-button">Generate creative preview <span>→</span></button>
    </form></Panel>}

    {(stage === 2 || stage === 3) && profile && <div className="creative-layout"><Panel title={stage === 2 ? "Generated creative" : "Creative approval"} note="Generated only from supplied facts."><div className="creative-preview" style={{ backgroundImage: `linear-gradient(180deg, transparent 25%, rgba(8,24,19,.94)), url(${photoUrls[0]})` }}><span className="creative-brand">{profile.projectName}</span><div><small>{profile.propertyType} · {profile.locality}</small><h3>{headline}</h3><p>{profile.price} · {profile.area}</p><strong>{profile.format === "Reel ad" ? "Reel storyboard" : "Enquire on WhatsApp"}</strong></div></div>{profile.format === "Reel ad" && <div className="storyboard"><span>01 Property</span><span>02 Highlights</span><span>03 Offer + CTA</span></div>}</Panel><aside className="workflow-panel approval-side"><h2>Copy and brand</h2><p>{copy}</p><dl><ReviewRow label="Headline" value={headline} /><ReviewRow label="CTA" value="Enquire on WhatsApp" /><ReviewRow label="Contact" value={profile.phone} /><ReviewRow label="Brand" value={`${profile.brandColors} · ${profile.visualStyle}`} /></dl>{stage === 2 ? <div className="approval-actions"><button className="approve-button" onClick={() => setStage(3)}>Continue to creative approval</button><button onClick={() => setStage(1)}>Edit property profile</button></div> : <><label className="change-field"><span>Requested changes</span><textarea placeholder="Describe what Lucy should modify" /></label><div className="approval-actions"><button className="approve-button" onClick={approveCreative}>Approve creative</button><button onClick={() => setStage(2)}>Regenerate</button><button onClick={() => setStage(1)}>Edit source facts</button></div></>}</aside></div>}

    {stage === 4 && profile && !campaign && <Panel title="Configure the Meta campaign" note="The creative is approved. Campaign choices stay editable until Approval #2."><form className="property-form expanded-form" onSubmit={configure}><div className="prerequisite-strip"><strong>Live prerequisites</strong><span>Business account</span><span>Facebook Page</span><span>Ad account</span><span>Payment method</span><span>Permissions</span><small>Not required in mock mode</small></div><FormGroup title="Goal and conversion"><Grid columns="three"><Select label="Campaign objective" name="objective" options={["Lead generation", "Messages", "Website traffic", "Awareness", "Engagement"]} /><Select label="Lead destination" name="destination" options={["WhatsApp", "Meta Instant Form", "Website / landing page", "Messenger", "Instagram Direct"]} /><Select label="CTA" name="cta" options={["Send WhatsApp message", "Learn more", "Apply now", "Contact us", "Book now"]} /></Grid><Field label="Destination / contact detail" name="destinationDetail" value={profile.phone} /></FormGroup><FormGroup title="Audience and placements"><Grid columns="two"><Field label="Target location" name="targetLocation" value={`${profile.city}, India`} /><Field label="Audience" name="audience" value="Broad housing audience in selected location" /></Grid><div className="housing-note"><strong>Housing safeguards</strong><span>Age, gender, demographic and detailed-interest controls remain broad because Meta restricts them for housing ads.</span></div><fieldset><legend>Placements</legend><div className="check-grid">{["Facebook Feed", "Instagram Feed", "Facebook Stories", "Instagram Stories", "Instagram Reels"].map(x => <label key={x}><input type="checkbox" name="placements" value={x} defaultChecked /> {x}</label>)}</div></fieldset></FormGroup><FormGroup title="Budget and schedule"><Grid columns="four"><Select label="Budget type" name="budgetType" options={["Daily budget", "Lifetime budget"]} /><Field label="Daily budget (₹)" name="dailyBudget" value="1000" type="number" /><Field label="Start date" name="startDate" value={today} type="date" /><Field label="Duration (days)" name="duration" value="7" type="number" /></Grid></FormGroup><button className="done-button">Build complete campaign review <span>→</span></button></form></Panel>}

    {stage === 4 && profile && campaign && <Panel title="Approval #2 — complete campaign review" note="Review creative, audience, delivery and maximum spend together."><div className="review-grid"><div className="review-creative" style={{ backgroundImage: `linear-gradient(180deg, transparent, rgba(8,24,19,.92)), url(${photoUrls[0]})` }}><span>{profile.projectName}</span><div><h3>{headline}</h3><p>{profile.price}</p></div></div><dl className="review-list"><ReviewRow label="Ad copy" value={copy} /><ReviewRow label="Objective" value={campaign.objective} /><ReviewRow label="Lead destination" value={`${campaign.destination} · ${campaign.destinationDetail}`} /><ReviewRow label="Audience" value={`${campaign.targetLocation} · ${campaign.audience}`} /><ReviewRow label="Placements" value={campaign.placements.join(", ")} /><ReviewRow label="Schedule" value={`${campaign.startDate} · ${campaign.duration} days`} /><ReviewRow label="Budget" value={`₹${Number(campaign.dailyBudget).toLocaleString("en-IN")} / day`} /><ReviewRow label="Estimated maximum spend" value={`₹${total.toLocaleString("en-IN")}`} emphasis /><ReviewRow label="Billing" value="Mock mode — no charge" /><ReviewRow label="CTA" value={campaign.cta} /></dl></div><div className="review-actions"><button onClick={() => setCampaign(null)}>Request campaign changes</button><button className="approve-button" onClick={recordCampaign} disabled={busy}>{busy ? "Recording exact campaign…" : "Continue to explicit Approval #2"}</button></div></Panel>}

    {stage === 5 && <Panel title={state.proposal?.status === "awaiting_approval" ? "Approval #2 — publish decision" : "Campaign operation history"} note="The exact proposal and spend limit are recorded in Supabase.">{state.proposal?.status === "awaiting_approval" ? <div className="final-decision"><div><strong>Explicit approval required</strong><p>This is the only action that can start the mock Meta launch.</p></div><button className="approve-button" onClick={() => decide("approve")} disabled={busy}>Approve #2 & run mock launch</button><button onClick={() => { decide("change"); setStage(4); setCampaign(null); }}>Request changes</button><button onClick={() => decide("cancel")}>Cancel</button></div> : <div className="operation-list">{state.operations.map((op, i) => <div className="operation-row" key={op.id}><span className="operation-index">{String(i + 1).padStart(2, "0")}</span><span className={`operation-dot op-${op.status}`} /><div><strong>{op.operation_type.replaceAll("_", " ")}</strong><small>{op.remote_id ?? op.last_error ?? "Recorded safely"}</small></div><span className="operation-status">{op.status}</span></div>)}</div>}</Panel>}
  </main>;
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) { return <section className="workflow-panel"><div className="workflow-panel-head"><div><h2>{title}</h2><p>{note}</p></div></div>{children}</section>; }
function FormGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="form-section"><h3>{title}</h3>{children}</section>; }
function Grid({ columns, children }: { columns: string; children: React.ReactNode }) { return <div className={`field-grid ${columns}`}>{children}</div>; }
function Field({ label, name, value, type = "text" }: { label: string; name: string; value: string | undefined; type?: string }) { return <label><span>{label}</span><input type={type} name={name} defaultValue={value ?? ""} required={label.includes("*")} /></label>; }
function Area({ label, name, value }: { label: string; name: string; value: string }) { return <label><span>{label}</span><textarea name={name} defaultValue={value} /></label>; }
function Select({ label, name, options }: { label: string; name: string; options: string[] }) { return <label><span>{label}</span><select name={name}>{options.map(x => <option key={x}>{x}</option>)}</select></label>; }
function Upload({ label, detail, accept, multiple, onChange }: { label: string; detail: string; accept: string; multiple?: boolean; onChange: (files: FileList | null) => void }) { return <label className="upload-box"><span>{label}</span><strong>{detail}</strong><input type="file" accept={accept} multiple={multiple} onChange={e => onChange(e.target.files)} /></label>; }
function ReviewRow({ label, value, emphasis }: { label: string; value: string | undefined; emphasis?: boolean }) { return <div className={emphasis ? "total-row" : ""}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>; }

async function workflowCommand(command: Record<string, unknown>) {
  const response = await fetch("/api/demo/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Workflow command failed.");
  return result;
}
