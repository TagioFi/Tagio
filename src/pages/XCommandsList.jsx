import { Link } from '@tanstack/react-router'

function Section({ eyebrow, title, children }) {
  return (
    <div className="card pad-lg" style={{ marginBottom: '1rem' }}>
      <div className="eyebrow" style={{ marginBottom: '0.4rem' }}>{eyebrow}</div>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 500, marginBottom: '0.6rem' }}>{title}</h2>
      {children}
    </div>
  )
}

function Cmd({ children }) {
  return <div className="cmd-block">{children}</div>
}

function P({ children }) {
  return <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.6, marginTop: '0.5rem' }}>{children}</p>
}

export default function XCommandsList() {
  return (
    <div id="app">
      <div style={{ maxWidth: '54rem', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
        <div className="topbar" style={{ padding: '0 0 1.25rem' }}>
          <div className="title">
            <h1>X commands</h1>
            <p>Everything you can ask TagioPay to do. Mention @TagioPay in a tweet or send it a DM.</p>
          </div>
          <div className="actions">
            <Link to="/dashboard" className="btn ghost sm">← Dashboard</Link>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)', lineHeight: 1.6, marginBottom: '1.25rem' }}>
          Every command below creates a transaction that you review and sign yourself in your dashboard's Pending tab. We never move your funds without your approval. Commands work the same whether you mention us in a tweet or send a DM.
        </p>

        <Section eyebrow="Core" title="Send">
          <Cmd>{`send 0.5 eth to @handle\nsend 25 usdg to #hashtag\nsend 10 usdg to 0xabc...`}</Cmd>
          <P>Pay any wallet, hashtag, or X handle directly. If you send to someone who hasn't linked a TagioPay wallet yet, we hold the funds safely until they do. Nothing is lost.</P>
        </Section>

        <Section eyebrow="Core" title="Trade (stocks)">
          <Cmd>{`swap 0.5 eth to GOOGL\nbuy 10 NVDA with 130 usdg`}</Cmd>
          <P>Swap ETH or USDG for tokenized stocks. You'll always see the exact quote before you sign anything.</P>
        </Section>

        <Section eyebrow="Core" title="Giveaway">
          <Cmd>{`send 0.0005 eth to any random 20 users who liked this\ngiveaway 50 usdg to 10 random people who commented`}</Cmd>
          <P>Pick random winners from the people who liked, commented on, or retweeted a post. Everyone gets paid in one go once the giveaway's conditions are met.</P>
        </Section>

        <Section eyebrow="Core" title="Airdrop">
          <Cmd>{`airdrop the top 50 holders of 0x1234... 0.3 eth\nairdrop users who bullposted $HOOD 40 usdg`}</Cmd>
          <P>Reward people right away, no luck involved. Airdrop existing holders of a token based on how much they hold, or reward people who posted about a topic, weighted by their engagement: likes count for 1 point, replies for 2, and retweets for 3.</P>
        </Section>

        <Section eyebrow="Causes" title="Donations and crowdfunding">
          <Cmd>{`$cause create "Flood Relief" goal: 5000 usdg wallet: 0xorganizer...\n$cause donate 50 usdg #CAUSE-12\n$donate 50usdg to "Flood Relief"\n$cause leaderboard #CAUSE-12\n$cause withdraw #CAUSE-12 1000usdg to "Vet bills"`}</Cmd>
          <P>Start a fundraiser, donate to one, or check the leaderboard of top donors. Everything is public and on the record. Only the person who started the cause can withdraw funds, and every withdrawal has to include a reason or proof. Also available from your dashboard's Causes tab.</P>
        </Section>

        <Section eyebrow="Escrow" title="Create, Accept, Deliver, Release">
          <Cmd>{`$escrow "Build 3 logos" 500usdg @designer\n$accept #4821\n$deliver #4821 https://drive.google.com/xyz\n$release #4821\n$cancel #4821`}</Cmd>
          <P>A safe way to pay for freelance work, or any deal where one side pays and the other delivers. You fund it, the other person accepts, delivers the work, and you release payment. If they never deliver, you're refunded automatically after a week. If you never release after they've delivered, they can claim it themselves after a few days, so neither side can hold the other hostage. Also available from your dashboard's Escrow tab.</P>
        </Section>

        <Section eyebrow="Private Send" title="Send without showing them who it's from">
          <Cmd>{`$psend 50usdg to @handle\n$claim`}</Cmd>
          <P>Send money without the recipient ever seeing your wallet address. They'll just see it came from TagioPay. This is everyday privacy, not full anonymity. It's usually claimed for them automatically, but they can always claim it themselves with $claim too. Also available from your dashboard's Private Send tab.</P>
        </Section>

        <Section eyebrow="Good to know" title="If we can't figure out what you meant">
          <P>If your giveaway or airdrop request is missing something, we'll ask you once, for everything we need, in a single message. If we still can't process it after that, we'll send you this same list instead of asking again, so you always know what to try next.</P>
        </Section>
      </div>
    </div>
  )
}
