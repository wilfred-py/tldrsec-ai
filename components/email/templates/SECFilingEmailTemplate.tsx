import React from 'react';
import Form11KEmailTemplate from '@/components/ui/email/templates/11k-template';
import Form144EmailTemplate from '@/components/ui/email/templates/form144-template';
import FormDEF14AEmailTemplate from '@/components/ui/email/templates/def14a-template';
import Schedule13DEmailTemplate from '@/components/ui/email/templates/13d-template';
import { FilingTemplateData } from '@/lib/email/types';

interface SECFilingEmailTemplateProps {
  filing: FilingTemplateData;
}

export default function SECFilingEmailTemplate({ filing }: SECFilingEmailTemplateProps) {
  // Select appropriate template based on filing type
  switch (filing.filingType) {
    case 'Form 11-K':
      return <Form11KEmailTemplate filing={filing} />;
    case 'Form 144':
      return <Form144EmailTemplate filing={filing} />;
    case 'Form DEF 14A':
      return <FormDEF14AEmailTemplate filing={filing} />;
    case 'Schedule 13D':
      return <Schedule13DEmailTemplate filing={filing} />;
    default:
      // For other filing types, use default template
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
              <p style={{ margin: "12px 0 0", fontSize: "18px", opacity: "0.9" }}>6/6/2025</p>
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
                        {filing.companyName} ({filing.symbol}) - {filing.filingType}
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
                  backgroundColor: "#fefefe",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
                        }}
                      >
                        📋 Summary
                      </h3>

                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Name:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "600" }}>
                                Vaibhav Taneja
                              </p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Position:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>Chief Financial Officer</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Form Type:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>Form 4</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Report Date:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>June 4, 2025</p>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "8px 0", width: "120px", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#6B7280", fontSize: "14px", fontWeight: "500" }}>
                                Trading Plan:
                              </p>
                            </td>
                            <td style={{ padding: "8px 0", verticalAlign: "top" }}>
                              <p style={{ margin: "0", color: "#374151", fontSize: "14px" }}>
                                Rule 10b5-1 plan adopted on May 1, 2024
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Transactions Box with Graphics */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fefefe",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
                        }}
                      >
                        💼 Notable Transactions
                      </h3>

                      <table width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
                        <tbody>
                          <tr>
                            <td style={{ padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                              <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                                <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "bold" }}>
                                  June 2, 2025
                                </p>
                              </div>
                              <ul
                                style={{
                                  margin: "0",
                                  paddingLeft: "32px",
                                  color: "#374151",
                                  fontSize: "14px",
                                  lineHeight: "1.6",
                                }}
                              >
                                <li style={{ marginBottom: "4px" }}>
                                  <span style={{ color: "#10B981", fontWeight: "bold" }}>+6,000 shares</span> acquired
                                  through stock option exercise at $18.22/share
                                </li>
                                <li style={{ marginBottom: "4px" }}>
                                  <span style={{ color: "#EF4444", fontWeight: "bold" }}>-6,000 shares</span> sold at
                                  $333.77-$347.22/share
                                </li>
                                <li>
                                  <span style={{ color: "#6B7280" }}>~2,733 shares sold for tax obligations</span>
                                </li>
                              </ul>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ padding: "12px 0" }}>
                              <div style={{ display: "flex", alignItems: "center", marginBottom: "8px" }}>
                                <p style={{ margin: "0", color: "#374151", fontSize: "14px", fontWeight: "bold" }}>
                                  June 3, 2025
                                </p>
                              </div>
                              <ul
                                style={{
                                  margin: "0",
                                  paddingLeft: "32px",
                                  color: "#374151",
                                  fontSize: "14px",
                                  lineHeight: "1.6",
                                }}
                              >
                                <li style={{ marginBottom: "4px" }}>
                                  <span style={{ color: "#10B981", fontWeight: "bold" }}>+1,000 shares</span> acquired
                                  through stock option exercise at $18.22/share
                                </li>
                                <li style={{ marginBottom: "4px" }}>
                                  <span style={{ color: "#EF4444", fontWeight: "bold" }}>-1,000 shares</span> sold at
                                  $350.00/share
                                </li>
                                <li>
                                  <span style={{ color: "#6B7280" }}>~455 shares sold for tax obligations</span>
                                </li>
                              </ul>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Holdings Table */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fefefe",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  marginBottom: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
                        }}
                      >
                        📊 Post-Transaction Holdings
                      </h3>

                      <table
                        width="100%"
                        cellPadding="0"
                        cellSpacing="0"
                        style={{
                          borderCollapse: "collapse",
                          border: "1px solid #e2e8f0",
                          borderRadius: "6px",
                        }}
                      >
                        <thead>
                          <tr style={{ backgroundColor: "#f8fafc" }}>
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
                              HOLDING TYPE
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
                              SHARES
                            </th>
                            <th
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                fontSize: "12px",
                                fontWeight: "bold",
                                color: "#6B7280",
                                borderBottom: "1px solid #e2e8f0",
                              }}
                            >
                              CHANGE
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
                              % CHANGE
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
                              }}
                            >
                              Direct Ownership
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              1,949.50
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  color: "#EF4444",
                                  fontSize: "14px",
                                  fontWeight: "bold",
                                }}
                              >
                                ↓ -3,267
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#EF4444",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              -62.6%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              Indirect - Taneja GRATs
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              55,500
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  color: "#6B7280",
                                  fontSize: "14px",
                                }}
                              >
                                → No Change
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#6B7280",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              0.0%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              Indirect - Spouse GRATs
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              55,500
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  color: "#6B7280",
                                  fontSize: "14px",
                                }}
                              >
                                → No Change
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                color: "#6B7280",
                                borderBottom: "1px solid #f1f5f9",
                              }}
                            >
                              0.0%
                            </td>
                          </tr>
                          <tr>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: "14px",
                                color: "#374151",
                              }}
                            >
                              Stock Options ($18.22)
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#374151",
                              }}
                            >
                              719,920
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "center",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  color: "#EF4444",
                                  fontSize: "14px",
                                  fontWeight: "bold",
                                }}
                              >
                                ↓ -7,000
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                textAlign: "right",
                                fontSize: "14px",
                                fontWeight: "bold",
                                color: "#EF4444",
                              }}
                            >
                              -0.96%
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      <p
                        style={{
                          margin: "12px 0 0",
                          fontSize: "12px",
                          color: "#6B7280",
                          fontStyle: "italic",
                        }}
                      >
                        * Stock options expire April 19, 2029
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Additional Details Box */}
              <table
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={{
                  backgroundColor: "#fefefe",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
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
                        }}
                      >
                        ℹ️ Additional Details
                      </h3>
                      <p style={{ margin: "0", color: "#374151", fontSize: "14px", lineHeight: "1.6" }}>
                        {filing.summaryText}
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
                href={filing.url}
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
                View Filing on SEC Website
              </a>
              <p style={{ margin: "16px 0 0", color: "#6B7280", fontSize: "12px" }}>
                © 2025 tldrSEC. All rights reserved.
              </p>
            </td>
          </tr>
        </tbody>
       </table>
    </div>
  );
  }
}
