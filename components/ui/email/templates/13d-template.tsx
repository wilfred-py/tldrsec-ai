import { FilingTemplateData } from '../../../../lib/email/types';

interface Schedule13DTemplateProps {
  filing: FilingTemplateData;
}

export default function Schedule13DEmailTemplate({ filing }: Schedule13DTemplateProps) {
  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", fontFamily: "Arial, sans-serif", backgroundColor: "#f8fafc" }}>
      {/* Header with gradient background */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
          color: "white",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px", textAlign: "center" }}>
              <h1 style={{ margin: "0", fontSize: "32px", fontWeight: "bold", letterSpacing: "-0.5px" }}>
                SEC Filing Summaries
              </h1>
              <p style={{ margin: "12px 0 0", fontSize: "18px", opacity: "0.9" }}>{new Date().toLocaleDateString()}</p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Filing Information */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderTop: "none" }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "24px" }}>
              <table width="100%" cellPadding="0" cellSpacing="0">
                <tbody>
                  <tr>
                    <td>
                      <h2
                        style={{
                          margin: "0",
                          background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                          fontSize: "24px",
                          fontWeight: "bold",
                        }}
                      >
                        {filing.companyName} ({filing.symbol || filing.ticker}) - Schedule 13D Filing
                      </h2>
                      <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: "14px" }}>Filed on: {new Date(filing.filingDate).toLocaleDateString()}</p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Summary Box */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                {filing.summaryData?.acquisitionDate || 'N/A'} Reporting Person:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "600" }}>
                                {filing.summaryData?.reportingPerson || 'N/A'}
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Schedule 13D (Beneficial Ownership)
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Acquisition Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>{filing.summaryData?.acquisitionDate || 'N/A'}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Filing Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>{new Date(filing.filingDate).toLocaleDateString()}</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "140px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Purpose:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                {filing.summaryData?.purpose || 'N/A'}
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Ownership Details */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📊 Ownership Position
                      </h3>

                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          borderCollapse: "collapse",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f1f5f9" }}>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "left",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              METRIC
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              AMOUNT
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              PERCENTAGE
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Shares Beneficially Owned
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              {filing.summaryData?.sharesBeneficiallyOwned || 'N/A'}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#10B981",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              {filing.summaryData?.ownershipPercentage || 'N/A'}%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Sole Voting Power
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              {filing.summaryData?.soleVotingPower || 'N/A'}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              {filing.summaryData?.ownershipPercentage || 'N/A'}%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              Sole Dispositive Power
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              {filing.summaryData?.soleDispositivePower || 'N/A'}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                                backgroundColor: "#ffffff",
                              }}
                            >
                              {filing.summaryData?.ownershipPercentage || 'N/A'}%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              Aggregate Purchase Price
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              {filing.summaryData?.aggregatePurchasePrice || 'N/A'}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#374151",
                                backgroundColor: "#f8fafc",
                              }}
                            >
                              {filing.summaryData?.pricePerShare || 'N/A'} per share
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Purpose and Plans */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 16px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        🎯 Purpose and Plans
                      </h3>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "12px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Investment Thesis
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          Starboard Value believes Twitter is significantly undervalued and has identified multiple
                          opportunities to enhance shareholder value through operational improvements, cost
                          optimization, and strategic initiatives.
                        </p>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "12px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Proposed Actions
                        </h4>
                        <ul
                          style={{
                            margin: "0",
                            paddingLeft: "20px",
                            color: "#374151",
                            fontSize: "14px",
                            lineHeight: "1.6",
                          }}
                        >
                          <li>Engage with management and board on strategic alternatives</li>
                          <li>Advocate for improved operational efficiency and cost structure</li>
                          <li>Explore potential board representation</li>
                          <li>Consider merger and acquisition opportunities</li>
                        </ul>
                      </div>

                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#f8fafc",
                          borderRadius: "6px",
                        }}
                      >
                        <h4
                          style={{
                            margin: "0 0 8px",
                            color: "#374151",
                            fontSize: "16px",
                            fontWeight: "bold",
                          }}
                        >
                          Timeline
                        </h4>
                        <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                          {filing.summaryData?.timeline || 'The reporting person has disclosed their intentions regarding future actions as required by Schedule 13D regulations.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Market Impact */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 0 1px rgba(0,0,0,0.1)",
                  backgroundImage: "linear-gradient(to bottom, #ffffff, #f9fafb)",
                }}
              >
                <tbody>
                  <tr>
                    <td style={{ padding: "20px" }}>
                      <h3
                        style={{
                          margin: "0 0 12px",
                          color: "#000000",
                          fontSize: "18px",
                          fontWeight: "bold",
                          borderBottom: "2px solid #f1f5f9",
                          paddingBottom: "8px",
                        }}
                      >
                        📈 Market Impact
                      </h3>
                      <p style={{ margin: "0 0 12px", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                        {filing.summaryData?.marketImpact || 'Market reaction to this filing has not been analyzed.'}
                      </p>
                      <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                        {filing.summaryData?.investmentContext || 'This filing represents a significant ownership position that may impact the company\'s strategic direction.'}
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        style={{
          backgroundColor: "white",
          borderRadius: "0 0 12px 12px",
          border: "1px solid #e2e8f0",
          borderTop: "none",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "20px", textAlign: "center" }}>
              <a
                href={filing.filingUrl}
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                View on SEC Website
              </a>
              <p style={{ margin: "16px 0 0", color: "#6B7280", fontSize: "12px" }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
