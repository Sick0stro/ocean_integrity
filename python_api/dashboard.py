import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime

# ===============================
# Load data
# ===============================
@st.cache_data
def load_data(file_path):
    df = pd.read_csv(file_path)
    df.columns = df.columns.str.strip().str.lower()

    # Ensure expected columns exist
    for col in [
        "invoice_weight_mt",
        "flagged",
        "flag_reason",
        "bill_from_company_name",
        "ship_to_company_name",
        "plastic_type",
        "ship_to_country_code",
        "vehicle_number",
        "generated_date",
        "in_compliance",
        "created_at"
    ]:
        if col not in df.columns:
            df[col] = ""

    # Type conversions
    df["invoice_weight_mt"] = pd.to_numeric(df["invoice_weight_mt"], errors="coerce").fillna(0)
    df["flagged"] = df["flagged"].astype(str).str.lower().isin(["yes", "true", "1"])
    df["in_compliance"] = df["in_compliance"].astype(str).str.lower().isin(["yes", "true", "1"])
    
    # Convert created_at to datetime if it exists
    if 'created_at' in df.columns and not df['created_at'].empty:
        df['created_at'] = pd.to_datetime(df['created_at'], errors='coerce')
    df["flag_reason"] = df["flag_reason"].fillna("")

    # Clean vehicle_number for display (remove dispatch codes like "& 8261")
    def clean_vehicle_display(v):
        if pd.isna(v) or not isinstance(v, str):
            return v
        return v.split("&")[0].split(",")[0].split("-")[0].strip()
    df["vehicle_number_display"] = df["vehicle_number"].apply(clean_vehicle_display)

    return df


# ===============================
# Streamlit App
# ===============================
st.set_page_config(page_title="Plastic Data Dashboard", layout="wide")
st.title("♻️ AMADAT X Ocean Integrity - OI-AI Data Dashboard")

# File upload
uploaded_file = st.file_uploader("Upload your CSV file", type=["csv"])
if uploaded_file:
    df = load_data(uploaded_file)

    # ===============================
    # KPIs with date range
    # ===============================
    # Add date range to header if created_at exists and has valid dates
    if 'created_at' in df.columns and not df['created_at'].isna().all():
        valid_dates = df[df['created_at'].notna()]
        if not valid_dates.empty:
            period_start = valid_dates['created_at'].min().strftime("%d %b %Y")
            period_end = valid_dates['created_at'].max().strftime("%d %b %Y")
            st.header(f"📊 Official Reporting ({period_start} – {period_end})")
        else:
            st.header("📊 Official Reporting (No Valid Dates)")
    else:
        st.header("📊 Official Reporting")

    # Calculate values
    total_records = len(df)
    total_weight = df["invoice_weight_mt"].sum(skipna=True)
    compliant_records = int(df["in_compliance"].sum())
    flagged_records = int(df["flagged"].sum())
    pct_flagged = (df["flagged"].mean() * 100) if len(df) else 0
    # Uncomment the line below to re-enable fees
    # fees = total_weight * 0.15
    user_count = df['user_id'].nunique() if 'user_id' in df.columns else 0

    # CSS styles for colored cards
    st.markdown("""
        <style>
        .metric-card {
            padding: 16px;
            border-radius: 10px;
            margin: 5px;
            text-align: center;
            font-weight: bold;
            font-size: 18px;
        }
        .records {border: 3px solid #888;}
        .users {border: 3px solid #6c5ce7;}
        .weight {border: 3px solid orange;}
        .compliant {border: 3px solid green;}
        .flagged {border: 3px solid red;}
        /* .fees {border: 3px solid #28a745;} */  /* Temporarily disabled */
        .value {font-size: 22px; margin-top: 5px;}
        .icon {font-size: 26px; display:block; margin-bottom: 5px;}
        </style>
    """, unsafe_allow_html=True)

    # Changed from 7 to 6 columns since we're hiding fees
    col1, col2, col3, col4, col5, col6 = st.columns(6)

    with col1:
        st.markdown(f"""
            <div class='metric-card records'>
                <div class='icon'>📦</div>
                Total Records
                <div class='value'>{total_records:,}</div>
            </div>
        """, unsafe_allow_html=True)

    with col2:
        st.markdown(f"""
            <div class='metric-card weight'>
                <div class='icon'>⚖️</div>
                Total Weight (MT)
                <div class='value'>{int(total_weight):,}</div>
            </div>
        """, unsafe_allow_html=True)

    with col3:
        st.markdown(f"""
            <div class='metric-card compliant'>
                <div class='icon'>✅</div>
                Compliant Records
                <div class='value'>{compliant_records:,}</div>
            </div>
        """, unsafe_allow_html=True)

    with col4:
        st.markdown(f"""
            <div class='metric-card flagged'>
                <div class='icon'>🚩</div>
                Flagged Records
                <div class='value'>{flagged_records:,}</div>
            </div>
        """, unsafe_allow_html=True)

    with col5:
        st.markdown(f"""
            <div class='metric-card flagged'>
                <div class='icon'>📊</div>
                % Flagged
                <div class='value'>{pct_flagged:.1f}%</div>
            </div>
        """, unsafe_allow_html=True)

    with col6:
        st.markdown(f"""
            <div class='metric-card users'>
                <div class='icon'>👥</div>
                Active Users
                <div class='value'>{user_count:,}</div>
            </div>
        """, unsafe_allow_html=True)
    
    # Fees section - uncomment to re-enable
    # with col7:
    #     st.markdown(f"""
    #         <div class='metric-card fees'>
    #             <div class='icon'>💵</div>
    #             Processing Fees ($)
    #             <div class='value'>{fees:,.2f}</div>
    #         </div>
    #     """, unsafe_allow_html=True)



    # ===============================
    # Compliance Table
    # ===============================
    st.subheader("✅ Compliance Table")
    compliant_df = df[df["in_compliance"] == True]
    show_cols_compliance = [
        "user_id",
        "user_name",
        "invoice_file_url",
        "ewaybill_file_url",
        "invoice_weight_mt",
        "bill_from_company_name",
        "ship_to_company_name",
        "plastic_type",
        "ship_to_country_code",   # keep here
        "vehicle_number_display", # cleaned vehicle number
        "generated_date",
    ]
    if not compliant_df.empty:
        st.dataframe(compliant_df[show_cols_compliance], use_container_width=True)
    else:
        st.info("No compliant records available.")

    # ===============================
    # BI / Insights
    # ===============================
    st.header("📈 BI & Insights")

    # Leadership Table
    st.subheader("🏆 Leadership Table (Top Recyclers Overall)")

    bill_from_stats = (
        df.groupby("bill_from_company_name")
        .agg(
            bill_from_mt=("invoice_weight_mt", "sum"),
            compliant_from=("in_compliance", "sum"),
            flagged_from=("flagged", "sum"),
        )
        .reset_index()
        .rename(columns={"bill_from_company_name": "company_name"})
    )

    ship_to_stats = (
        df.groupby("ship_to_company_name")
        .agg(
            ship_to_mt=("invoice_weight_mt", "sum"),
            compliant_to=("in_compliance", "sum"),
            flagged_to=("flagged", "sum"),
        )
        .reset_index()
        .rename(columns={"ship_to_company_name": "company_name"})
    )

    traders = pd.merge(bill_from_stats, ship_to_stats, on="company_name", how="outer").fillna(0)

    traders["total_mt"] = traders["bill_from_mt"] + traders["ship_to_mt"]
    traders["total_flagged"] = traders["flagged_from"] + traders["flagged_to"]
    traders["total_compliant"] = traders["compliant_from"] + traders["compliant_to"]

    traders["% compliant"] = (
        traders["total_compliant"] / (traders["total_compliant"] + traders["total_flagged"] + 1e-6) * 100
    ).round(1)

    # Only keep important columns
    traders = traders[["company_name", "total_mt", "total_flagged", "% compliant"]]

    traders = traders.sort_values(by="total_mt", ascending=False).head(15)

    st.dataframe(traders, use_container_width=True)

    # Top Recyclers Chart
    st.subheader("Top Recyclers by Weight")
    fig = px.bar(
        traders,
        x="total_mt",
        y="company_name",
        orientation="h",
        labels={"total_mt": "Total Weight (MT)", "company_name": "Recycler"},
        color="total_mt",
        color_continuous_scale="Viridis",
        title="Top Recyclers by Weight",
    )
    st.plotly_chart(fig, use_container_width=True)

    # Plastic type distribution
    st.subheader("Plastic Type Distribution")
    plastic_counts = df.groupby("plastic_type")["invoice_weight_mt"].sum().reset_index()
    if not plastic_counts.empty:
        fig = px.bar(
            plastic_counts,
            x="plastic_type",
            y="invoice_weight_mt",
            title="Total Weight by Plastic Type (MT)",
            text_auto=True,
            color="plastic_type",
        )
        st.plotly_chart(fig, use_container_width=True)

        # ===============================
    # Time trends (Matched vs Flagged)
    # ===============================
    st.subheader("📅 Time Trends: Matched vs Flagged")

    if "generated_date" in df.columns and df["generated_date"].notna().any():
        try:
            df["date"] = pd.to_datetime(df["generated_date"], errors="coerce", dayfirst=True)

            trend = (
                df.groupby(pd.Grouper(key="date", freq="M"))
                .agg(
                    matched_mt=("invoice_weight_mt", lambda x: x[df.loc[x.index, "in_compliance"]].sum()),
                    flagged_mt=("invoice_weight_mt", lambda x: x[df.loc[x.index, "flagged"]].sum()),
                )
                .reset_index()
            )

            fig = go.Figure()
            fig.add_trace(go.Bar(
                x=trend["date"], y=trend["matched_mt"],
                name="Matched Weight (MT)", marker_color="green"
            ))
            fig.add_trace(go.Bar(
                x=trend["date"], y=trend["flagged_mt"],
                name="Flagged Weight (MT)", marker_color="red"
            ))

            fig.update_layout(
                barmode="stack",
                title="Monthly Trends: Matched vs Flagged Weight",
                xaxis=dict(title="Date"),
                yaxis=dict(title="Weight (MT)"),
                legend=dict(orientation="h"),
            )
            st.plotly_chart(fig, use_container_width=True)
        except Exception as e:
            st.info(f"⚠️ Could not parse generated_date into time series. Error: {e}")
    else:
        st.info("No generated_date available for trends.")


    # ===============================
    # Flag Analysis
    # ===============================
    st.header("🚩 Flag Analysis")

    # Flagged records table
    st.subheader("Flagged Records")
    flagged_df = df[df["flagged"] == True]
    show_cols_flagged = [
        "user_id",
        "user_name",
        "invoice_file_url",
        "ewaybill_file_url",
        "invoice_weight_mt",
        "bill_from_company_name",
        "ship_to_company_name",
        "plastic_type",
        "ship_to_country_code",   # keep here
        "vehicle_number_display", # cleaned vehicle number
        "generated_date",
        "flag_reason",
        "flagged_pair_value",
    ]
    if not flagged_df.empty:
        st.dataframe(flagged_df[show_cols_flagged], use_container_width=True)
    else:
        st.success("✅ No flagged records found.")

    # Pie chart of flag reasons
    st.subheader("Flag Reasons Breakdown")
    flag_counts = df["flag_reason"].value_counts()
    if not flag_counts.empty:
        fig = px.pie(
            values=flag_counts.values,
            names=flag_counts.index,
            title="Distribution of Flag Reasons",
            color_discrete_sequence=px.colors.qualitative.Set2,
        )
        st.plotly_chart(fig, use_container_width=True)

    # Total MT per flag reason
    st.subheader("Total Weight (MT) by Flag Reason")
    flagged_mt = (
        df.groupby("flag_reason")["invoice_weight_mt"]
        .sum()
        .reset_index()
        .sort_values(by="invoice_weight_mt", ascending=False)
    )
    flagged_mt = flagged_mt[flagged_mt["flag_reason"] != ""]
    if not flagged_mt.empty:
        fig = px.bar(
            flagged_mt,
            x="invoice_weight_mt",
            y="flag_reason",
            orientation="h",
            labels={"invoice_weight_mt": "Total MT", "flag_reason": "Flag Reason"},
            title="Weight per Flag Reason",
            text_auto=True,
            color="invoice_weight_mt",
            color_continuous_scale="Reds",
        )
        st.plotly_chart(fig, use_container_width=True)

else:
    st.info("⬆️ Upload a CSV file to begin.")
