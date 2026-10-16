"use client";

import React, { useState } from "react";
import { Check, Edit2, X, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { ProposedAction, InterpretationResult } from "@/lib/validation/voice";
import { Badge } from "../ui/shared";

interface ActionPreviewProps {
  interpretation: InterpretationResult;
  provider?: string;
  model?: string;
  fallbackUsed?: boolean;
  onDiscard: () => void;
}

export function ActionPreview({
  interpretation,
  provider,
  model,
  fallbackUsed,
  onDiscard,
}: ActionPreviewProps) {
  const [actions, setActions] = useState<ProposedAction[]>(interpretation.actions);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isApprovedLocally, setIsApprovedLocally] = useState(false);

  const handleActionChange = (index: number, updated: ProposedAction) => {
    const next = [...actions];
    next[index] = updated;
    setActions(next);
  };

  const handleRemoveAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleConfirm = () => {
    setIsApprovedLocally(true);
    setEditingIndex(null);
  };

  const renderActionReadable = (action: ProposedAction) => {
    switch (action.type) {
      case "inventory_unavailable":
        return (
          <>
            <strong>Mark unavailable / out of stock:</strong>{" "}
            <span className="highlight">{action.ingredient}</span>
            {action.originalIngredientText && (
              <small className="muted"> (from &ldquo;{action.originalIngredientText}&rdquo;)</small>
            )}
          </>
        );
      case "inventory_set_quantity":
        return (
          <>
            <strong>Set stock quantity:</strong>{" "}
            <span className="highlight">{action.ingredient}</span> to{" "}
            <strong>{action.quantity} {action.unit}</strong>
            {action.originalIngredientText && (
              <small className="muted"> (from &ldquo;{action.originalIngredientText}&rdquo;)</small>
            )}
          </>
        );
      case "inventory_add_quantity":
        return (
          <>
            <strong>Add / purchased quantity:</strong>{" "}
            <strong>+{action.quantity} {action.unit}</strong> of{" "}
            <span className="highlight">{action.ingredient}</span>
          </>
        );
      case "inventory_remove_quantity":
        return (
          <>
            <strong>Used / consumed quantity:</strong>{" "}
            <strong>-{action.quantity} {action.unit}</strong> of{" "}
            <span className="highlight">{action.ingredient}</span>
          </>
        );
      case "fasting_status_update":
        return (
          <>
            <strong>Update fasting status:</strong> Member{" "}
            <span className="highlight">{action.member}</span> is{" "}
            <Badge tone={action.active ? "amber" : "neutral"}>
              {action.active ? "Fasting" : "Not fasting"}
            </Badge>
          </>
        );
      case "meal_request":
        return (
          <>
            <strong>Requested dish / meal:</strong>{" "}
            <span className="highlight">{action.dish}</span>
            {action.servings && <span> for {action.servings} people</span>}
            {action.mealType && <span> ({action.mealType})</span>}
            {action.date && <span> on {action.date}</span>}
          </>
        );
      case "unknown":
      default:
        return (
          <div className="unknown-action-text">
            <span className="badge warning">Needs clarification / Unhandled</span>
            <p className="reason-text">{action.reason}</p>
            {action.rawText && <small className="muted">Source: &ldquo;{action.rawText}&rdquo;</small>}
          </div>
        );
    }
  };

  return (
    <div className="action-preview-card card">
      <div className="section-heading">
        <div>
          <h2>Proposed Kitchen Changes</h2>
          <p className="muted">
            All AI interpretations are untrusted proposals requiring your review.
          </p>
        </div>
        {provider && (
          <div className="provider-chip">
            <Badge tone={fallbackUsed ? "amber" : "neutral"}>
              {provider} ({model}) {fallbackUsed && "· Fallback"}
            </Badge>
          </div>
        )}
      </div>

      <div className="original-transcript-display">
        <strong>Original Transcript:</strong>
        <p className="transcript-quote">&ldquo;{interpretation.transcript}&rdquo;</p>
      </div>

      {interpretation.warnings.length > 0 && (
        <div className="warnings-list">
          {interpretation.warnings.map((w, idx) => (
            <div key={idx} className="notice-box warning">
              <AlertTriangle size={16} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {isApprovedLocally ? (
        <div className="approval-confirmation-banner">
          <ShieldCheck size={28} className="success-icon" />
          <div>
            <h3>Ready to apply (Locally Approved)</h3>
            <p>
              Your proposal preview has been approved locally.
              <br />
              <small className="muted">
                Note: In Phase 3.1, actual database writes and automatic meal replanning are simulated and not applied to production storage.
              </small>
            </p>
          </div>
          <button
            type="button"
            className="button secondary sm"
            onClick={() => setIsApprovedLocally(false)}
          >
            Review or Edit Again
          </button>
        </div>
      ) : (
        <div className="actions-list">
          {actions.map((act, idx) => (
            <div
              key={idx}
              className={`action-item-card ${act.type === "unknown" ? "item-unknown" : ""}`}
            >
              <div className="action-main-content">
                <span className="action-index-badge">{idx + 1}</span>
                <div className="action-details">
                  {editingIndex === idx ? (
                    <div className="action-inline-editor">
                      <strong>Edit Action #{idx + 1}</strong>
                      {"ingredient" in act && (
                        <div className="form-group-inline">
                          <label>Ingredient:</label>
                          <input
                            type="text"
                            value={act.ingredient}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                ingredient: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      {"quantity" in act && (
                        <div className="form-group-inline">
                          <label>Quantity:</label>
                          <input
                            type="number"
                            value={act.quantity}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                quantity: Number(e.target.value),
                              })
                            }
                          />
                        </div>
                      )}
                      {"member" in act && (
                        <div className="form-group-inline">
                          <label>Member:</label>
                          <input
                            type="text"
                            value={act.member}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                member: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      {"dish" in act && (
                        <div className="form-group-inline">
                          <label>Dish:</label>
                          <input
                            type="text"
                            value={act.dish}
                            onChange={(e) =>
                              handleActionChange(idx, {
                                ...act,
                                dish: e.target.value,
                              })
                            }
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        className="button primary sm"
                        onClick={() => setEditingIndex(null)}
                      >
                        Done Editing
                      </button>
                    </div>
                  ) : (
                    renderActionReadable(act)
                  )}
                </div>
              </div>

              {editingIndex !== idx && (
                <div className="action-row-controls">
                  {act.type !== "unknown" && (
                    <button
                      type="button"
                      className="button icon-btn"
                      onClick={() => setEditingIndex(idx)}
                      title="Edit this proposed action"
                    >
                      <Edit2 size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="button icon-btn danger"
                    onClick={() => handleRemoveAction(idx)}
                    title="Remove this proposed action"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="preview-footer-controls">
        <button
          type="button"
          className="button secondary"
          onClick={onDiscard}
        >
          Cancel & Discard
        </button>

        {!isApprovedLocally && (
          <button
            type="button"
            className="button primary"
            onClick={handleConfirm}
            disabled={actions.length === 0}
          >
            <Check size={18} /> Confirm proposals (Ready to apply)
          </button>
        )}
      </div>
    </div>
  );
}
