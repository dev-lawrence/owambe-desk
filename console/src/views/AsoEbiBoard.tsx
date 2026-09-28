import {Alert02Icon} from '@hugeicons/core-free-icons'
import {formatNaira} from '@owambe/shared'
import {useDocumentProjection, useQuery} from '@sanity/sdk-react'
import {Box, Card, Dialog, Flex, Grid, Stack, Text} from '@sanity/ui'
import type {WorkflowInstance} from '@sanity/workflow-engine'
import {useWorkflowInstances} from '@sanity/workflow-sdk'
import {Suspense, useId, useState} from 'react'

import {errorText, Icon, Loading, Notice} from '../components/common'
import {Present} from '../components/Presence'
import {WorkflowDetail} from '../components/WorkflowDetail'
import {useEngine} from '../engine'
import {lotTotals, needsReview, ORDER_STAGES, type LotRow} from '../lib/board'
import {subjectId} from '../lib/workflow'

const LOTS_QUERY = `*[_type == "asoEbiLot" && !(_id in path("drafts.**"))] | order(colourName asc){
  _id, colourName, fabricType, price, stock,
  "orders": *[_type == "asoEbiOrder" && lot._ref == ^._id && !(_id in path("drafts.**"))]{quantity, amount, paidAt}
}`

type Order = {
  quantity: number | null
  amount: {amount: string} | null
  paidAt: string | null
  bachsPaymentId: string | null
  guest: string | null
  colour: string | null
}

function Totals() {
  const {data: lots} = useQuery<LotRow[]>({query: LOTS_QUERY})
  const totals = lots.map(lotTotals)
  return (
    <Grid gridTemplateColumns={[1, 2, 3, 5]} gap={3}>
      {totals.map((lot) => (
        <Card key={lot._id} padding={3} radius={2} border>
          <Stack gap={2}>
            <Text size={1} weight="medium">
              {lot.colourName}
            </Text>
            <Text size={3} weight="semibold">
              {formatNaira(lot.collected)}
            </Text>
            <Text size={0} muted>
              {lot.paidUnits} paid{lot.unpaidUnits ? `, ${lot.unpaidUnits} unpaid` : ''}
              {lot.remaining !== null ? ` · ${lot.remaining} left` : ''}
            </Text>
          </Stack>
        </Card>
      ))}
    </Grid>
  )
}

function OrderCardBody({documentId, stage}: {documentId: string; stage: string}) {
  const {data: order} = useDocumentProjection<Order>({
    documentId,
    documentType: 'asoEbiOrder',
    projection: '{quantity, amount, paidAt, bachsPaymentId, "guest": guest->person->name, "colour": lot->colourName}',
  })
  if (!order) return <Text size={1}>Order deleted</Text>
  const review = needsReview(order, stage)
  return (
    <Stack gap={2}>
      <Flex gap={2} align="center">
        <Box flex={1} style={{minWidth: 0}}>
          <Text size={1} weight="medium" textOverflow="ellipsis">
            {order.guest ?? 'Unknown guest'}
          </Text>
        </Box>
        <Present documentId={documentId} documentType="asoEbiOrder" />
      </Flex>
      <Text size={1} muted>
        {order.quantity} × {order.colour}
      </Text>
      <Text size={1}>{order.amount ? formatNaira(order.amount.amount) : '—'}</Text>
      {review ? (
        <Text size={0}>
          <Icon icon={Alert02Icon} size={12} /> Bachs recorded a payment, but the order is not marked paid. Reconcile by hand.
        </Text>
      ) : null}
    </Stack>
  )
}

function OrderCard({instance, onOpen}: {instance: WorkflowInstance; onOpen: () => void}) {
  const documentId = subjectId(instance)
  return (
    <Card as="button" padding={3} radius={2} border onClick={onOpen} style={{textAlign: 'left', width: '100%'}}>
      {documentId ? (
        <Suspense fallback={<Loading />}>
          <OrderCardBody documentId={documentId} stage={instance.currentStage} />
        </Suspense>
      ) : (
        <Text size={1}>No order</Text>
      )}
    </Card>
  )
}

export function AsoEbiBoard() {
  const engine = useEngine()
  const {instances, loading, error} = useWorkflowInstances({engine, filter: {definition: 'aso-ebi-order', includeCompleted: true}})
  const [open, setOpen] = useState<string | null>(null)
  const dialogId = useId()

  if (error) return <Notice tone="critical">Could not load orders: {errorText(error)}</Notice>
  return (
    <Stack gap={5}>
      <Suspense fallback={<Loading label="Loading lots" />}>
        <Totals />
      </Suspense>
      <Text size={1} muted>
        Collected is what Bachs confirmed for paid orders, at the price each guest agreed when ordering. Unpaid orders do not hold stock.
      </Text>
      {loading || !instances ? (
        <Loading label="Loading orders" />
      ) : (
        <Box style={{overflowX: 'auto'}}>
          <Box style={{display: 'grid', gridTemplateColumns: `repeat(${ORDER_STAGES.length}, minmax(180px, 1fr))`, gap: 12}}>
            {ORDER_STAGES.map((stage) => {
              const column = instances.filter((i) => i.currentStage === stage.name && !i.abortedAt).sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt))
              return (
                <Stack key={stage.name} gap={2}>
                  <Text size={1} weight="semibold">
                    {stage.title} ({column.length})
                  </Text>
                  {column.map((instance) => (
                    <OrderCard key={instance._id} instance={instance} onOpen={() => setOpen(instance._id)} />
                  ))}
                </Stack>
              )
            })}
          </Box>
        </Box>
      )}
      {open ? (
        <Dialog id={dialogId} header="Aso ebi order" onClose={() => setOpen(null)} width={2}>
          <Box padding={4}>
            <WorkflowDetail instanceId={open} />
          </Box>
        </Dialog>
      ) : null}
    </Stack>
  )
}
