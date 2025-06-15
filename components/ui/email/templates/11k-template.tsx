import { FilingTemplateData } from '../../../../lib/email/types';

interface Form11KTemplateProps {
  filing: FilingTemplateData;
}

export default function Form11KEmailTemplate({ filing }: Form11KTemplateProps) {
  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: "#ffffff",
        border: "1px solid #e5e7eb",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          padding: "24px",
          textAlign: "center" as const,
          borderRadius: "8px 8px 0 0",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        }}
      >
        <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "bold" }}>📊 Form 11-K Filed</h1>
        <p style={{ margin: "0", fontSize: "16px", opacity: 0.9 }}>
          Annual Report of Employee Stock Purchase, Savings, and Similar Plans
        </p>
      </div>

      {/* Company Info */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(to right, #f8fafc, #f1f5f9)",
          borderBottom: "1px solid #e2e8f0",
          boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.1)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 0", fontWeight: "bold", color: "#1f2937" }}>Company:</td>
              <td style={{ padding: "4px 0", color: "#374151" }}>Apple Inc.</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", fontWeight: "bold", color: "#1f2937" }}>Plan Name:</td>
              <td style={{ padding: "4px 0", color: "#374151" }}>Apple Inc. 401(k) Plan</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", fontWeight: "bold", color: "#1f2937" }}>Plan Year:</td>
              <td style={{ padding: "4px 0", color: "#374151" }}>December 31, 2023</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", fontWeight: "bold", color: "#1f2937" }}>Filing Date:</td>
              <td style={{ padding: "4px 0", color: "#374151" }}>June 28, 2024</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 0", fontWeight: "bold", color: "#1f2937" }}>Total Participants:</td>
              <td style={{ padding: "4px 0", color: "#374151" }}>154,000</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Plan Assets Summary */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
          borderBottom: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#000000",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px",
          }}
        >
          💰 Plan Assets Summary
        </h3>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse" as const,
            backgroundColor: "white",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <th
                style={{
                  padding: "12px",
                  textAlign: "left" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Asset Category
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                2023 Value
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                2022 Value
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {filing.summaryData?.planAssets?.map((asset, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}>{asset.category}</td>
                <td style={{ padding: "12px", textAlign: "right" as const, borderBottom: "1px solid #f1f5f9" }}>${asset.value2023.toLocaleString()}</td>
                <td style={{ padding: "12px", textAlign: "right" as const, borderBottom: "1px solid #f1f5f9" }}>${asset.value2022.toLocaleString()}</td>
                <td
                  style={{
                    padding: "12px",
                    textAlign: "right" as const,
                    borderBottom: "1px solid #f1f5f9",
                    color: asset.change > 0 ? "#059669" : "#dc2626",
                  }}
                >
                  {asset.change > 0 ? "↗ " : "↘ "} {asset.change.toFixed(2)}%
                </td>
              </tr>
            ))}
            <tr style={{ backgroundColor: "#ffffff", fontWeight: "bold" }}>
              <td style={{ padding: "12px", borderTop: "2px solid #e5e7eb" }}>Total Plan Assets</td>
              <td style={{ padding: "12px", textAlign: "right" as const, borderTop: "2px solid #e5e7eb" }}>${filing.summaryData?.totalPlanAssets?.toLocaleString() || 'N/A'}</td>
              <td style={{ padding: "12px", textAlign: "right" as const, borderTop: "2px solid #e5e7eb" }}>${filing.summaryData?.totalPlanAssets2022?.toLocaleString() || 'N/A'}</td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  borderTop: "2px solid #e5e7eb",
                  color: "#059669",
                }}
              >
                {filing.summaryData?.totalPlanAssetsChange ? `↗ ${filing.summaryData.totalPlanAssetsChange.toFixed(2)}%` : 'N/A'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Investment Performance */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
          borderBottom: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#000000",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px",
          }}
        >
          📈 Top Investment Options Performance
        </h3>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse" as const,
            backgroundColor: "white",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <th
                style={{
                  padding: "12px",
                  textAlign: "left" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Investment Option
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                1-Year Return
              </th>
              <th
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  fontWeight: "bold",
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                Assets
              </th>
            </tr>
          </thead>
          <tbody>
            {filing.summaryData?.investmentOptions?.map((option, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9fafb" }}>
                <td style={{ padding: "12px", borderBottom: "1px solid #f1f5f9" }}>{option.name}</td>
                <td
                  style={{
                    padding: "12px",
                    textAlign: "right" as const,
                    borderBottom: "1px solid #f1f5f9",
                    color: option.return > 0 ? "#059669" : "#dc2626",
                  }}
                >
                  {option.return > 0 ? "↗ " : "↘ "} {option.return.toFixed(2)}%
                </td>
                <td style={{ padding: "12px", textAlign: "right" as const, borderBottom: "1px solid #f1f5f9" }}>${option.assets.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Plan Highlights */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
          borderBottom: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#000000",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px",
          }}
        >
          ✨ 2023 Plan Highlights
        </h3>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>Participation Rate:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>{filing.summaryData?.participationRate ?? 'N/A'}</span>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>Average Account Balance:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>${filing.summaryData?.averageAccountBalance?.toLocaleString() ?? 'N/A'}</span>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>Company Match:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>
              ${filing.summaryData?.companyMatch?.toLocaleString() ?? 'N/A'} (6% match on first 6% of salary)
            </span>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>New Investment Options:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>{filing.summaryData?.newInvestmentOptions || 'N/A'}</span>
          </div>
          <div>
            <strong style={{ color: "#000000" }}>Plan Expenses:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>{filing.summaryData?.planExpenses || 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Participant Statistics */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
          borderBottom: "1px solid #e5e7eb",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#000000",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px",
          }}
        >
          👥 Participant Demographics
        </h3>

        <table
          style={{
            width: "100%",
            borderCollapse: "collapse" as const,
            backgroundColor: "white",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <tbody>
            <tr style={{ backgroundColor: "#f8fafc" }}>
              <td style={{ padding: "12px", fontWeight: "bold", color: "#374151", borderBottom: "1px solid #e5e7eb" }}>
                Active Participants
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  color: "#374151",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                {filing.summaryData?.activeParticipants || 'N/A'}
              </td>
            </tr>
            <tr style={{ backgroundColor: "#ffffff" }}>
              <td style={{ padding: "12px", color: "#374151", borderBottom: "1px solid #f1f5f9" }}>
                Participants with Loans
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  color: "#374151",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                12,300 (8%)
              </td>
            </tr>
            <tr style={{ backgroundColor: "#f9fafb" }}>
              <td style={{ padding: "12px", color: "#374151", borderBottom: "1px solid #f1f5f9" }}>
                Participants with Hardship Withdrawals
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  color: "#374151",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                2,100 (1.4%)
              </td>
            </tr>
            <tr style={{ backgroundColor: "#ffffff" }}>
              <td style={{ padding: "12px", color: "#374151", borderBottom: "1px solid #f1f5f9" }}>
                New Participants in 2023
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right" as const,
                  color: "#374151",
                  borderBottom: "1px solid #f1f5f9",
                }}
              >
                18,500
              </td>
            </tr>
            <tr style={{ backgroundColor: "#f9fafb" }}>
              <td style={{ padding: "12px", color: "#374151" }}>Average Contribution Rate</td>
              <td style={{ padding: "12px", textAlign: "right" as const, color: "#374151" }}>8.2% of salary</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Compliance & Regulatory */}
      <div
        style={{
          padding: "20px",
          background: "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.05)",
        }}
      >
        <h3
          style={{
            margin: "0 0 16px 0",
            fontSize: "18px",
            fontWeight: "bold",
            color: "#000000",
            borderBottom: "2px solid #667eea",
            paddingBottom: "8px",
          }}
        >
          ⚖️ Compliance & Regulatory Updates
        </h3>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>ERISA Compliance:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>
              Plan passed all required non-discrimination tests
            </span>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>Audit Status:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>
              Clean audit opinion received from independent auditors
            </span>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong style={{ color: "#000000" }}>SECURE Act 2.0:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>Implemented automatic enrollment for new hires</span>
          </div>
          <div>
            <strong style={{ color: "#000000" }}>Fiduciary Review:</strong>
            <span style={{ color: "#374151", marginLeft: "8px" }}>Annual investment committee review completed</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px",
          backgroundColor: "#f8fafc",
          textAlign: "center" as const,
          fontSize: "12px",
          color: "#6b7280",
          borderTop: "1px solid #e5e7eb",
        }}
      >
        <p style={{ margin: "0" }}>
          This summary is based on the official Form 11-K filing. For complete details, please refer to the full SEC
          filing.
        </p>
      </div>
    </div>
  )
}
